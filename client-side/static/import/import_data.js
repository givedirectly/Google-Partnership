import damageLevelsList from '../damage_levels.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import getResources from '../resources.js';

export {crowdAiDamageKey};
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
const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const incomeKey = 'HD01_VD01';
// check with crowd ai folks about name.
const crowdAiDamageKey = 'descriptio';

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
  const damageLevels = ee.List(damageLevelsList);
  const damageFilters =
      damageLevels.map((type) => ee.Filter.eq(crowdAiDamageKey, type));
  const geometry = feature.geometry();
  const blockDamage =
      ee.FeatureCollection(resources.damage).filterBounds(geometry);
  const totalBuildings = buildings.get(feature.get(geoidTag));
  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map((type) => blockDamage.filter(type).size()));
  const damagedBuildings =
      ee.Number(attrDict.values().reduce(ee.Reducer.sum()));
  const ratioBuildingsDamaged =
      ee.Number(damagedBuildings).divide(totalBuildings);
  const snapPop = ee.Number.parse(feature.get(snapPopTag)).long();
  const totalPop = ee.Number.parse(feature.get(totalPopTag)).long();
  return ee.Feature(
      geometry,
      attrDict.set(geoidTag, feature.get(geoidTag))
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
        snapFeature.get(snapKey),
        totalPopTag,
        snapFeature.get(totalKey),
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
    sviFeature.get(sviTag),
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
 * @param {ee.Feature} feature
 * @return {*}
 */
function attachBlockGroups(feature) {
  const blockGroups =
      ee.FeatureCollection('users/juliexxia/harvey-data-aff-as-nod');
  const filtered = blockGroups.filterBounds(feature.geometry());
  // since we're only using block groups from damaged areas, we have buildings
  // that won't intersect any block groups.
  const geoid = ee.Algorithms.If(
      filtered.size().gt(ee.Number(0)), filtered.first().get(geoidTag),
      ee.Number(0));
  return feature.set(geoidTag, geoid);
}

/** Performs operation of processing inputs and creating output asset. */
function run() {
  ee.initialize();

  const resources = getResources();
  const snap = ee.FeatureCollection(resources.rawSnap)
                   .map((feature) => stringifyGeoid(feature, censusGeoidKey));
  // filter block groups to those with damage.
  const blockGroups = ee.Join.simple().apply(
      ee.FeatureCollection(resources.bg),
      ee.FeatureCollection(resources.damage),
      ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}));
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
      ee.FeatureCollection(resources.svi),
      ee.FeatureCollection(resources.damage),
      ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}));
  const joinedSnapIncomeSVI =
      ee.Join.inner()
          .apply(
              joinedSnapIncome.map(addTractInfo), svi,
              ee.Filter.equals({leftField: tractTag, rightField: geoidTag}))
          .map(combineWithSvi);
  // attach block groups to buildings and aggregate to get block group building
  // counts
  const buildings = ee.FeatureCollection(resources.buildings);
  const withBlocKGroup = buildings.map(attachBlockGroups);
  const buildingsHisto =
      ee.Dictionary(withBlocKGroup.aggregate_histogram(geoidTag));
  // process final feature collection
  const data = joinedSnapIncomeSVI.map(
      (feature) => countDamageAndBuildings(feature, buildingsHisto));

  const assetName = 'harvey-data-ms-as-nod';
  // TODO(#61): parameterize ee user account to write assets to or make GD
  // account.
  // TODO: delete existing asset with same name if it exists.
  const task =
      ee.batch.Export.table.to(data, assetName, 'users/juliexxia/' + assetName);
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
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
      '.apps.googleusercontent.com';

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
