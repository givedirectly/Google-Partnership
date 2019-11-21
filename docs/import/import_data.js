import {Authenticator} from '../authenticate.js';
import {gdEePathPrefix} from '../ee_paths.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getDisaster, getResources} from '../resources.js';
import storeCenter from './center.js';
import {cdcGeoidKey, cdcSviKey, censusBlockGroupKey, censusGeoidKey, incomeKey, snapKey, tigerGeoidKey, totalKey} from './import_data_keys.js';
import TaskAccumulator from '../task_accumulator.js';
import {readDisasterDocument} from '../firestore_document.js';
import {loadNavbarWithPicker} from '../navbar.js';
import {gdEeStatePrefix} from '../ee_paths';

/** @VisibleForTesting */
// Don't use $(callback) to see if document is ready so we can unit-test this.
export {countDamageAndBuildings, domLoaded};

/**
 * Joins a state's census block-group-level SNAP/population data with building
 * counts and damage, and creates a FeatureCollection. Requires that all of
 * the source assets are already uploaded. Uploading a .csv or .shp can be done
 * with something like the command line:
 * `earthengine upload table --asset_id users/janak/census_building_data \
 *      gs://noaa-michael-data/ACS_16_5YR_B25024_with_ann.csv`
 * (assuming the file has already been uploaded into Google Cloud Storage).
 *
 * Current workflow for a new disaster
 *
 * 0) download SNAP data from american fact finder (2016 ACS 5-year estimates)
 *      https://factfinder.census.gov/faces/nav/jsf/pages/download_center.xhtml
 * 1) clean up illegal property names in (0) by running ./cleanup_acs.sh
 *    /path/to/snap/data.csv
 * 2) download TIGER block group .shp from census website
 *      https://www.census.gov/cgi-bin/geo/shapefiles/index.php
 * 3) download crowd ai damage data .shp file
 * 4) upload results of (1) (2) and (3) to GCS
 * 5) upload results of (5) to earth engine (see instructions above)
 * 6) add a new entry to {@code disasters} in ./resources.js
 * 7) update the {@code disaster} constant in ./resources.js
 * 8) visit http://localhost:8080/import_data.html
 * 9) make the new asset readable by all in code
 * editor.
 */
// TODO: factor in margins of error?

/**
 * Given a feature from the SNAP census data, returns a new
 * feature with GEOID, SNAP #, total pop #, total building count, building
 * counts for all damage categories, and SNAP percentage and damage percentage.
 *
 * @param {ee.Feature} feature
 * @param {ee.Dictionary} buildings geoid -> # buildings
 * @return {Feature}
 */
function countDamageAndBuildings(feature, buildings) {
  const resources = getResources();
  const geometry = feature.geometry();
  const damagedBuildings =
      ee.FeatureCollection(resources.damage).filterBounds(geometry).size();
  const totalBuildings = buildings.get(feature.get(geoidTag));
  const ratioBuildingsDamaged =
      ee.Number(damagedBuildings).divide(totalBuildings);
  const snapPop = ee.Number.parse(feature.get(snapPopTag)).long();
  const totalPop = ee.Number.parse(feature.get(totalPopTag)).long();
  return ee.Feature(
      geometry,
      ee.Dictionary()
          .set(geoidTag, feature.get(geoidTag))
          .set(blockGroupTag, feature.get(blockGroupTag))
          .set(snapPopTag, ee.Number(snapPop))
          .set(totalPopTag, ee.Number(totalPop))
          .set(snapPercentageTag, ee.Number(snapPop).divide(totalPop))
          // These entries can't be parsed to numbers easily because have some
          // non-number values like "-" :(
          .set(incomeTag, feature.get(incomeTag))
          .set(sviTag, feature.get(sviTag))
          .set(buildingCountTag, totalBuildings)
          .set(damageTag, ratioBuildingsDamaged));
}

/**
 * Post-processes the join of snap data and tiger geometries to form a single
 * feature.
 * @param {ee.Feature} feature
 * @param {string} snapKey
 * @param {string} totalKey
 * @return {ee.Feature}
 */
function combineWithSnap(feature, snapKey, totalKey) {
  const snapFeature = ee.Feature(feature.get('primary'));
  return ee.Feature(
      ee.Feature(feature.get('secondary')).geometry(), ee.Dictionary([
        geoidTag,
        snapFeature.get(censusGeoidKey),
        blockGroupTag,
        snapFeature.get(censusBlockGroupKey),
        snapPopTag,
        ee.Number.parse(snapFeature.get(snapKey)),
        totalPopTag,
        ee.Number.parse(snapFeature.get(totalKey)),
      ]));
}

/**
 * Post-process the join to another asset to form a single feature.
 * @param {ee.Feature} feature
 * @param {string} tag column where value will be stored
 * @param {string} key original column name
 * @return {ee.Feature}
 */
function combineWithAsset(feature, tag, key) {
  const incomeFeature = ee.Feature(feature.get('secondary'));
  // TODO: make income formatting prettier so it looks like a currency value.
  // Not trivial because it has some non-valid values like '-'.
  return ee.Feature(feature.get('primary')).set(ee.Dictionary([
    tag,
    incomeFeature.get(key),
  ]));
}

/**
 * Convert the GEOid2 column into a string column for sake of matching to
 * TIGER data.
 *
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function stringifyGeoid(feature) {
  return feature.set(censusGeoidKey, ee.String(feature.get(censusGeoidKey)));
}

/**
 * Extracts the census tract geoid from the block group id so it can be used
 * to join to SVI data. The census tract geoid is the block group id minus the
 * last digit.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function addTractInfo(feature) {
  const blockGroupId = ee.String(feature.get(geoidTag));
  const tractGeoid =
      blockGroupId.slice(0, ee.Number(blockGroupId.length()).subtract(1));
  return feature.set(tractTag, tractGeoid);
}

/**
 * For a ms building, find and attach the relevant block group to it.
 * @param {ee.Feature} building
 * @param {ee.FeatureCollection} blockGroups
 * @return {ee.Feature}
 */
function attachBlockGroups(building, blockGroups) {
  const filtered = blockGroups.filterBounds(building.geometry());
  // since we're only using block groups from damaged areas, we have buildings
  // that won't intersect any block groups.
  const geoid = ee.Algorithms.If(
      filtered.size().gt(ee.Number(0)), filtered.first().get(tigerGeoidKey),
      ee.String('PLACEHOLDER GEOID VALUE'));
  return building.set(geoidTag, geoid);
}

function addGeoIdToBlock(feature, idKey, blockOnlyKey) {
  const blockCode = ee.String(feature.get(idKey));
  return feature.set(tigerGeoidKey, blockCode.substring(0, blockCode.length() -
      ee.String(feature.get(blockOnlyKey)).length() + 1));
}

function missingAssetError(str) {
  $('.compute-status').html('Error! Please specify ' + str + ' at <a href="./add_disaster.html">add_disaster.html</a>');
  return false;
}

/** Performs operation of processing inputs and creating output asset. */
function run(disasterData) {
  const states = disasterData['states'];
  if (!states) {
    return missingAssetError('affected states');
  }
  const assetData = disasterData['asset-data'];
  if (!assetData) return missingAssetError('SNAP/damage asset paths');
  const censusShapefileAsset = assetData['tiger-asset-path'];
  if (!censusShapefileAsset) return missingAssetError('TIGER Census Blocks');
  const censusStateKey = assetData['tiger-state-key'];
  if (censusStateKey) return missingAssetError('TIGER state key');
  const snapData = assetData['snap-data'];
  if (!snapData) return missingAssetError('SNAP info');
  const snapPaths = snapData['paths'];
  if (!snapPaths) return missingAssetError('SNAP table asset paths');
  const numStates = states.length;
  if (snapPaths.length !== numStates)
    return missingAssetError(
        'the same number of states and SNAP table asset paths');
  const snapKey = snapData['paths']['snap-key'];
  if (!snapKey)
    return missingAssetError('column name for SNAP recipients in SNAP table');
  const totalKey = snapData['paths']['total-key'];
  if (!totalKey)
    return missingAssetError('column name for total population in SNAP table');
  const sviPaths = assetData['svi-asset-path'];
  if (!sviPaths) return missingAssetError('SVI table asset paths');
  if (sviPaths.length !== numStates)
    return missingAssetError(
        'the same number of states and SVI table asset paths');
  const sviKey = assetData['svi-key'];
  if (!sviKey) return missingAssetError('column name for SVI table');
  const incomePaths = assetData['income-asset-path'];
  if (!incomePaths) return missingAssetError('Income table asset paths');
  if (incomePaths.length !== numStates)
    return missingAssetError(
        'the same number of states and income table asset paths');
  const incomeKey = assetData['income-key'];
  if (!incomeKey) return missingAssetError('column name for income table');

  const damagePath = disasterData['damage-asset-path'];
  let damage;
  if (damagePath) {
    damage = ee.FeatureCollection(damagePath);
    const centerStatusLabel = document.createElement('span');
    centerStatusLabel.innerText = 'Computing and storing bounds of map: ';
    const centerStatusSpan = document.createElement('span');
    centerStatusSpan.innerText = 'in progress';
    storeCenter(damage)
        .then(trimGeoNumbers)
        .then(
            (bounds) => centerStatusSpan.innerText = 'Found bounds (' +
                bounds[0] + ', ' + bounds[1] + '), (' + bounds[2] + ', ' +
                bounds[3] + ')')
        .catch((err) => centerStatusSpan.innerText = err);
    $('.compute-status').append(centerStatusLabel);
    $('.compute-status').append(centerStatusSpan);
  }

  const snapCollection = createMergedFeatureCollection(snapPaths);

  let processing =
      snapCollection.map((feature) => stringifyGeoid(feature, censusGeoidKey));
  let blockGroups = ee.FeatureCollection(censusShapefileAsset);
  if (damage) {
    // Filter block groups to those with damage.
    blockGroups = intersectIfDefined(blockGroups, damage);
  } else {
    // Filter to those in the relevant states.
    blockGroups = blockGroups.filter(ee.Filter.listContains({leftValue: states.map((state) => fipsMap.get(state)), rightField: censusStateKey}));
  }
  blockGroups = blockGroups.map(addGeoIdToBlock);

  // join snap stats to block group geometries
  processing =
      ee.Join.inner()
          .apply(
              processing, blockGroups,
              ee.Filter.equals(
                  {leftField: censusGeoidKey, rightField: tigerGeoidKey}))
          .map((f) => combineWithSnap(f, snapKey, totalKey));
  // join with income
  processing =
      ee.Join.inner()
          .apply(
              processing, createMergedFeatureCollection(incomePaths),
              ee.Filter.equals(
                  {leftField: geoidTag, rightField: censusGeoidKey}))
          .map((f) => combineWithAsset(f, incomeTag, incomeKey));
  const svi = intersectIfDefined(createMergedFeatureCollection(sviPaths), damage);
  processing =
      ee.Join.inner()
          .apply(
              processing.map(addTractInfo), svi,
              ee.Filter.equals({leftField: tractTag, rightField: cdcGeoidKey}))
          .map((f) => combineWithAsset(f, sviTag, sviKey));
  if (damage) {
    // attach block groups to buildings and aggregate to get block group building
    // counts
    const buildings = createMergedFeatureCollection(states.map((state) => ee.FeatureCollection(gdEeStatePrefix + state + '/ms-buildings')));
    const withBlockGroup =
        buildings.map((building) => attachBlockGroups(building, blockGroups));
    const buildingsHisto =
        ee.Dictionary(withBlockGroup.aggregate_histogram(geoidTag));
    // process final feature collection
    processing = processing.map(
        (feature) => countDamageAndBuildings(feature, buildingsHisto));
  }

  const assetName = 'data-ms-as-tot';
  const scoreAssetPath = gdEePathPrefix + getDisaster() + '/' + assetName;
  ee.data.deleteAsset(scoreAssetPath);
  const task = ee.batch.Export.table.toAsset(
      processing, assetName, scoreAssetPath);
  task.start();
  $('.upload-status')
      .text('Check Code Editor console for upload progress. Task: ' + task.id);
  joinedSnap.size().evaluate((val, failure) => {
    if (val) {
      $('.upload-status').append('\n<p>Found ' + val + ' elements');
    } else {
      $('.upload-status').append('\n<p>Error getting size: ' + failure);
    }
  });
}

// 3 tasks: EE authentication, page load, firebase data retrieved..
const taskAccumulator = new TaskAccumulator(3, enableWhenReady);

const firebaseAuthPromise = Authenticator.withFirebasePromiseCloudApiAndTaskAccumulator(taskAccumulator);
let firebaseDataPromise = firebaseAuthPromise.then(readDisasterDocument);
firebaseDataPromise.then(() => taskAccumulator.taskCompleted());

function enableWhenReady() {
  const processButton = $('#process-button');
  processButton.prop('disabled', false);
  // firebaseDataPromise is guaranteed to be done already by the time this code
  // runs, so we do this await just so that run can avoid the Promise.
  processButton.on('click', async () => run(await firebaseDataPromise));
}

function domLoaded() {
  loadNavbarWithPicker(firebaseAuthPromise);
  taskAccumulator.taskCompleted();
}

/**
 * Displays latitude/longitude in a reasonable way. https://xkcd.com/2170/.
 * @param {Array<number>} latOrLngs
 * @return {Array<string>} numbers truncated to 4 digits.
 */
function trimGeoNumbers(latOrLngs) {
  return latOrLngs.map((num) => num.toFixed(4));
}

function createMergedFeatureCollection(assetPaths) {
  let result = ee.FeatureCollection([]);
  assetPaths.foreach((p) => result = result.merge(ee.FeatureCollection(p)));
  return result;
}

function intersectIfDefined(features, maybeFeatures) {
  if (!maybeFeatures) {
    return features;
  }
  return ee.Join.simple().apply(
      ee.FeatureCollection(features), maybeFeatures,
      ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}));
}

// https://www.nrcs.usda.gov/wps/portal/nrcs/detail/?cid=nrcs143_013696
// Use strings because that's what EE thinks FIPS code column is.
const fipsMap = new Map([
['AL', '1'],
['AK', '2'],
['AZ', '4'],
['AR', '5'],
['CA', '6'],
['CO', '8'],
['CT', '9'],
['DE', '10'],
['FL', '12'],
['GA', '13'],
['HI', '15'],
['ID', '16'],
['IL', '17'],
['IN', '18'],
['IA', '19'],
['KS', '20'],
['KY', '21'],
['LA', '22'],
['ME', '23'],
['MD', '24'],
['MA', '25'],
['MI', '26'],
['MN', '27'],
['MS', '28'],
['MO', '29'],
['MT', '30'],
['NE', '31'],
['NV', '32'],
['NH', '33'],
['NJ', '34'],
['NM', '35'],
['NY', '36'],
['NC', '37'],
['ND', '38'],
['OH', '39'],
['OK', '40'],
['OR', '41'],
['PA', '42'],
['RI', '44'],
['SC', '45'],
['SD', '46'],
['TN', '47'],
['TX', '48'],
['UT', '49'],
['VT', '50'],
['VA', '51'],
['WA', '53'],
['WV', '54'],
['WI', '55'],
['WY', '56'],
['AS', '60'],
['GU', '66'],
['MP', '69'],
['PR', '72'],
['VI', '78'],
]);
