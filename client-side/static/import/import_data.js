import {CLIENT_ID} from '../authenticate.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {disaster, getResources} from '../resources.js';
import storeCenter from './center.js';

/** @VisibleForTesting */
export {countDamageAndBuildings};


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

const censusGeoidKey = 'GEOid2';
const censusBlockGroupKey = 'GEOdisplay-label';
const tigerGeoidKey = 'GEOID';
const cdcGeoidKey = 'FIPS';
const cdcSviKey = 'RPL_THEMES';
const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const incomeKey = 'HD01_VD01';
// check with crowd ai folks about name.
// const crowdAiDamageKey = 'descriptio';

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
 * Post-process the join of snap data and tiger geometries to form a single
 * feature.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function combineWithSnap(feature) {
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
 * Post-process the join to income data to form a single feature.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function combineWithIncome(feature) {
  const incomeFeature = ee.Feature(feature.get('secondary'));
  // TODO: make income formatting prettier so it looks like a currency value.
  // Not trivial because it has some non-valid values like '-'.
  return ee.Feature(feature.get('primary')).set(ee.Dictionary([
    incomeTag,
    incomeFeature.get(incomeKey),
  ]));
}

/**
 * Post-process the join to SVI data to form a single feature.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function combineWithSvi(feature) {
  const sviFeature = ee.Feature(feature.get('secondary'));
  return ee.Feature(feature.get('primary')).set(ee.Dictionary([
    sviTag,
    sviFeature.get(cdcSviKey),
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

/** Performs operation of processing inputs and creating output asset. */
function run() {
  ee.initialize();

  const resources = getResources();
  const damage = ee.FeatureCollection(resources.damage);
  storeCenter(damage);

  const snap = ee.FeatureCollection(resources.rawSnap)
                   .map((feature) => stringifyGeoid(feature, censusGeoidKey));
  // filter block groups to those with damage.
  const blockGroups = ee.Join.simple().apply(
      ee.FeatureCollection(resources.bg), damage,
      ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}));

  blockGroups.size().evaluate((yes, no) => {
    console.log(yes);
    console.log(no);
    console.log('blockGroups');
  });

  // join snap stats to block group geometries
  const joinedSnap =
      ee.Join.inner()
          .apply(
              snap, blockGroups,
              ee.Filter.equals(
                  {leftField: censusGeoidKey, rightField: tigerGeoidKey}))
          .map(combineWithSnap);
  // join with income
  const joinedSnapIncome =
      ee.Join.inner()
          .apply(
              joinedSnap, ee.FeatureCollection(resources.income),
              ee.Filter.equals(
                  {leftField: geoidTag, rightField: censusGeoidKey}))
          .map(combineWithIncome);
  // filter SVI to those with damage and join
  const svi = ee.Join.simple().apply(
      ee.FeatureCollection(resources.svi), damage,
      ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}));
  const joinedSnapIncomeSVI =
      ee.Join.inner()
          .apply(
              joinedSnapIncome.map(addTractInfo), svi,
              ee.Filter.equals({leftField: tractTag, rightField: cdcGeoidKey}))
          .map(combineWithSvi);
  // attach block groups to buildings and aggregate to get block group building
  // counts
  const buildings = ee.FeatureCollection(resources.buildings);
  const withBlockGroup =
      buildings.map((building) => attachBlockGroups(building, blockGroups));
  const buildingsHisto =
      ee.Dictionary(withBlockGroup.aggregate_histogram(geoidTag));
  // process final feature collection
  const data = joinedSnapIncomeSVI.map(
      (feature) => countDamageAndBuildings(feature, buildingsHisto));

  const assetName = 'data-ms-as-nod';
  // TODO(#61): parameterize ee user account to write assets to or make GD
  // account.
  // TODO: delete existing asset with same name if it exists.
  const task = ee.batch.Export.table.toAsset(
      data, assetName, 'users/gd/' + disaster + '/' + assetName);
  task.start();
  $('.upload-status')
      .text('Check Code Editor console for progress. Task: ' + task.id);
  joinedSnap.size().evaluate((val, failure) => {
    if (val) {
      $('.upload-status').append('\n<p>Found ' + val + ' elements');
    } else {
      $('.upload-status').append('\n<p>Error getting size: ' + failure);
    }
  });
}

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, we do the work.
 */
function setup() {
  $(document).ready(function() {
    // Shows a button prompting the user to log in.
    const onImmediateFailed = function() {
      $('.g-sign-in').removeClass('hidden');
      $('.output').text('(Log in to see the result.)');
      $('.g-sign-in .button').click(function() {
        ee.data.authenticateViaPopup(function() {
          // If the login succeeds, hide the login button and run the analysis.
          $('.g-sign-in').addClass('hidden');
          run();
        });
      });
    };

    // Attempt to authenticate using existing credentials.
    // TODO: deprecated, use ee.data.authenticateViaOauth()
    ee.data.authenticate(CLIENT_ID, run, 'error', null, onImmediateFailed);

    // run();
  });
}

setup();
