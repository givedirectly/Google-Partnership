import damageLevelsList from './damage_levels.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeErrorTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from './property_names.js';

export {crowdAiDamageKey};
/** @VisibleForTesting */
export {countDamageAndBuildings, disaster, DisasterMapValue, disasters};

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
 * 6) add a new entry to {@code disasters}
 * 7) update the {@code disaster} constant
 * 8) visit http://localhost:8080/import_data.html
 * 9) make the new <disaster>-snap-and-damage asset readable by all in code
 * editor.
 */
// TODO: factor in margins of error?

/** The current disaster. */
const disaster = 'harvey';

const censusGeoidKey = 'GEOid2';
const censusBlockGroupKey = 'GEOdisplay-label';
const tigerGeoidKey = 'GEOID';
const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const incomeKey = 'HD01_VD01';
const incomeErrorKey = 'HD02_VD01';
// check with crowd ai folks about name.
const crowdAiDamageKey = 'descriptio';

/** Disaster asset names and other constants. */
const disasters = new Map();

/** Constants for {@code disasters} map. */
class DisasterMapValue {
  /**
   * @param {string} damageAsset ee asset path
   * @param {string} snapAsset ee asset path to snap info
   * @param {string} bgAsset ee asset path to block group info
   */
  constructor(damageAsset, snapAsset, bgAsset, incomeAsset, sviAsset) {
    this.damageAsset = damageAsset;
    this.rawSnapAsset = snapAsset;
    this.bgAsset = bgAsset;
    this.incomeAsset = incomeAsset;
    this.sviAsset = sviAsset;
  }
}

// TODO: upload michael income and SVI data
disasters.set(
    'michael',
    new DisasterMapValue(
        'users/juliexxia/crowd_ai_michael', 'users/juliexxia/florida_snap',
        'users/juliexxia/tiger_florida'));

disasters.set(
    'harvey',
    new DisasterMapValue(
        'users/juliexxia/harvey-damage-crowdai-format',
        'users/juliexxia/snap_texas', 'users/juliexxia/tiger_texas',
        'users/juliexxia/income_texas', 'users/ruthtalbot/harvey-SVI'));

/**
 * Given a feature from the SNAP census data, returns a new
 * feature with GEOID, SNAP #, total pop #, total building count, building
 * counts for all damage categories, and SNAP percentage and damage percentage.
 *
 * @param {ee.Feature} feature
 * @return {Feature}
 */
function countDamageAndBuildings(feature) {
  const resources = disasters.get(disaster);
  const damage = ee.FeatureCollection(resources.damageAsset);
  const damageLevels = ee.List(damageLevelsList);
  const damageFilters =
      damageLevels.map((type) => ee.Filter.eq(crowdAiDamageKey, type));
  const geometry = feature.geometry();
  const blockDamage = damage.filterBounds(geometry);

  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map((type) => blockDamage.filter(type).size()));
  const totalBuildings = attrDict.values().reduce(ee.Reducer.sum());
  const ratioBuildingsDamaged = ee.Number(totalBuildings)
                                    .subtract(attrDict.get('no-damage'))
                                    .divide(totalBuildings);
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
          // non-number values like "**" and "-" :(
          .set(incomeTag, feature.get(incomeTag))
          .set(incomeErrorTag, feature.get(incomeErrorTag))
          .set(sviTag, feature.get(sviTag))
          .set(buildingCountTag, totalBuildings)
          .set(damageTag, ratioBuildingsDamaged));
}

function fixSnap(feature) {
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

function fixIncome(feature) {
  const incomeFeature = ee.Feature(feature.get('secondary'));
  return ee.Feature(feature.get('primary')).set(ee.Dictionary([
    incomeTag, incomeFeature.get(incomeKey), incomeErrorTag,
    incomeFeature.get(incomeErrorKey)
  ]));
}


function fixSVI(feature) {
  const sviFeature = ee.Feature(feature.get('secondary'));
  return ee.Feature(feature.get('primary')).set(ee.Dictionary([
    sviTag, sviFeature.get(sviTag)
  ]));
}

/**
 * Convert the GEOid2 column into a string column for sake of matching to
 * TIGER data.
 *
 * @param {ee.Feature} feature
 * @param {String} geoidKey
 * @return {ee.Feature}
 */
function stringifyGeoid(feature, geoidKey) {
  return feature.set(geoidKey, ee.String(feature.get(geoidKey)));
}

function addTractInfo(feature) {
  const blockGroupId = ee.String(feature.get(geoidTag));
  const tractGeoid =
      blockGroupId.slice(0, ee.Number(blockGroupId.length()).subtract(1));
  return feature.set(tractTag, tractGeoid);
}

/** Performs operation of processing inputs and creating output asset. */
function run() {
  ee.initialize();

  const resources = disasters.get(disaster);
  const snapAsset =
      ee.FeatureCollection(resources.rawSnapAsset)
          .map((feature) => stringifyGeoid(feature, censusGeoidKey));
  const blockGroupAsset =
      ee.FeatureCollection(resources.bgAsset)
          .filterBounds(ee.FeatureCollection(resources.damageAsset).geometry());
  const joinedSnap =
      ee.Join.inner()
          .apply(
              snapAsset, blockGroupAsset,
              ee.Filter.equals(
                  {leftField: censusGeoidKey, rightField: tigerGeoidKey}))
          .map(fixSnap);

  const joinedSnapIncome =
      ee.Join.inner()
          .apply(
              joinedSnap, ee.FeatureCollection(resources.incomeAsset),
              ee.Filter.equals(
                  {leftField: geoidTag, rightField: censusGeoidKey}))
          .map(fixIncome);

  const svi =
      ee.FeatureCollection(resources.sviAsset)
          .filterBounds(ee.FeatureCollection(resources.damageAsset).geometry());

  const joinedSnapIncomeSVI =
      ee.Join.inner()
          .apply(
              joinedSnapIncome.map(addTractInfo), svi,
              ee.Filter.equals({leftField: tractTag, rightField: geoidTag}))
          .map(fixSVI);

  const assetName = disaster + '-data';
  // TODO(#61): parameterize ee user account to write assets to or make GD
  // account.
  // TODO: delete existing asset with same name if it exists.
  const task = ee.batch.Export.table.toAsset(
      joinedSnapIncomeSVI.map(countDamageAndBuildings), assetName,
      'users/juliexxia/' + assetName);
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
