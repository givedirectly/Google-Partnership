import oldImportData from './old_import_data.js';

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
 * 2) download TIGER block group shapefile from census website
 *      https://www.census.gov/cgi-bin/geo/shapefiles/index.php
 * 3) download crowd ai damage data
 * 4) convert (3) from KML/geojson -> shapefile using something like
 *      https://mygeodata.cloud/converter/kml-to-shp
 * 5) upload results of (1) (2) and (4) to GCS
 * 6) upload results of (5) to earth engine (see instructions above)
 * 7) add a new entry to {@code disasters}
 * 8) update the {@code disaster} constant
 * 9) visit http://localhost:8080/import_data.html
 */
// TODO: factor in margins of error?

/** The current disaster. */
const disaster = 'harvey';

const damageLevelsList = ['no-damage', 'minor-damage', 'major-damage'];

const censusGeoidKey = 'GEOid2';
const censusBlockGroupKey = 'GEOdisplay-label';
const tigerGeoidKey = 'GEOID';
const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
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
  constructor(damageAsset, snapAsset, bgAsset) {
    this.damageAsset = damageAsset;
    this.rawSnapAsset = snapAsset;
    this.bgAsset = bgAsset;
  }
}

disasters.set(
    'michael',
    new DisasterMapValue(
        'users/juliexxia/crowd_ai_michael' /* damageAsset */,
        'users/juliexxia/ACS_16_5YR_B22010_with_ann' /* rawSnapAsset */,
        'users/juliexxia/tiger_florida' /* bgAsset */));


disasters.set(
    'harvey',
    new DisasterMapValue(
        'users/juliexxia/harvey-damage-crowdai-format' /* damageAsset */,
        'users/juliexxia/snap_texas' /* rawSnapAsset */,
        'users/juliexxia/tiger_texas' /* bgAsset */));

/**
 * Given a feature from the SNAP census data, returns a new
 * feature with GEOID, SNAP #, total pop #, total building count and
 * building counts for all damage categories.
 *
 * @param {ee.Feature} feature
 * @return {Feature}
 */
function countDamageAndBuildings(feature) {
  const resources = disasters.get(disaster);
  const damage = ee.FeatureCollection(resources.damageAsset);
  const damageLevels = ee.List(damageLevelsList);
  const damageFilters = damageLevels.map(
      (type) => ee.Filter.eq(crowdAiDamageKey, type));
  const geometry = ee.Feature(feature.get('secondary')).geometry();
  const blockDamage = damage.filterBounds(geometry);

  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map((type) => blockDamage.filter(type).size()));
  const totalBuildings = damageLevels.iterate((current, lastResult) => {
    return ee.Number(lastResult).add(ee.Number(attrDict.get(current)));
  }, ee.Number(0));
  const snapFeature = ee.Feature(feature.get('primary'));
  return ee.Feature(
      geometry,
      attrDict.set('GEOID', snapFeature.get(censusGeoidKey))
          .set('BLOCK_GROUP', snapFeature.get(censusBlockGroupKey))
          .set('SNAP', snapFeature.get(snapKey))
          .set('TOTAL', snapFeature.get(totalKey))
          .set('BUILDING_COUNT', totalBuildings));
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

/** Performs operation of processing inputs and creating output asset. */
function run() {
  ee.initialize();

  const resources = disasters.get(disaster);
  const snapAsset =
      ee.FeatureCollection(resources.rawSnapAsset).map(stringifyGeoid);
  const blockGroupAsset =
      ee.FeatureCollection(resources.bgAsset)
          .filterBounds(
              ee.FeatureCollection(resources.damageAsset).geometry());
  const joinedSnap = ee.Join.inner().apply(
      snapAsset, blockGroupAsset,
      ee.Filter.equals(
          {leftField: censusGeoidKey, rightField: tigerGeoidKey}));

  const assetName = disaster + '-snap-and-damage';
  // TODO(#61): parameterize ee user account to write assets to or make GD
  // account.
  // TODO: delete existing asset with same name if it exists.
  const task = ee.batch.Export.table.toAsset(
      joinedSnap.map(countDamageAndBuildings), assetName,
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
