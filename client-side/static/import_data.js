import oldImportData from './old_import_data.js';

/**
 * Joins Texas Census block-group-level SNAP/population data with building
 * counts and damage, and creates a FeatureCollection. Requires that all of
 * the source assets are already uploaded. Uploading a Census table can be done
 * with something like the command line:
 * `earthengine upload table --asset_id users/janak/census_building_data \
 *      gs://noaa-michael-data/ACS_16_5YR_B25024_with_ann.csv`
 * (assuming the file has already been uploaded into Google Cloud Storage).
 *
 * This script can be run locally by visiting
 * http://localhost:8080/import_data.html
 *
 * Current workflow for a new disaster
 *
 * 0) download SNAP data from american fact finder
 * 1) download TIGER shapefile from census website
 * 2) join in gGIS
 // TODO: preprocess SNAP so property names only include A-Z, a-z, 0-9, '_'
 * 3) make sure no property names have illegal names
 // TODO(#22): get raw Census data, and do the snap join in this script as
 // well.
 * 3) download crowd ai damage data
 * 4) upload results of (2) and (3) to GCS
 * 5) upload results of (4) to earth engine (see instructions above)
 * 6) add a new entry to {@code disasters}
 * 7) update the {@code disaster} constant
 * 6) visit http://localhost:8080/import_data.html
 */
// TODO: factor in margins of error?

/** The current disaster to import data for*/
const disaster = 'michael';

/** Disaster asset names and other constants. */
const disasters = new Map();

/** Constants for {@code disasters} map. */
class DisasterMapValue {
  /**
   *
   * @param {string} damageKey property name for # damaged buildings
   * @param {string} damageAsset ee asset path
   * @param {string} rawSnapAsset ee asset path
   * @param {string} snapKey property name for # snap recipients
   * @param {string} totalKey property name for # total population
   */
  constructor(
    damageKey, damageAsset, rawSnapAsset, snapKey, totalKey) {
    this.damageKey = damageKey;
    this.damageAsset = damageAsset;
    this.rawSnapAsset = rawSnapAsset;
    this.snapKey = snapKey;
    this.totalKey = totalKey;
  }
}

disasters.set(
    'michael',
    new DisasterMapValue(
        // TODO: make constant
        'descriptio' /* damageKey */,
        'users/juliexxia/crowd_ai_michael' /* damageAsset */,
        'users/juliexxia/florida_snap' /* rawSnapAsset */,
        // TODO: make constant?
        'ACS_16_5_4' /* snapKey */,
        // TODO: make constant?
        'ACS_16_5_2' /* totalKey */));

/**
 * Given a feature the snap-shapefile joined feature collection, returns a new
 * feature with GEOID, SNAP #, Total pop #, total building count and
 * building counts for all damage categories.
 *
 * @param {ee.Feature} feature
 * @return {Feature|undefined}
 */
function countDamageAndBuildings(feature) {
  const resources = disasters.get(disaster);
  const damage = ee.FeatureCollection(resources.damageAsset);
  const damageLevels = ee.List(['no-damage', 'minor-damage', 'major-damage']);
  const damageFilters =
      damageLevels.map((type) => ee.Filter.eq(resources.damageKey, type));


  const geometry = feature.geometry();
  const blockDamage = damage.filterBounds(geometry);

  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map((type) => blockDamage.filter(type).size()));
  const totalBuildings = damageLevels.iterate((current, lastResult) => {
    return ee.Number(lastResult).add(ee.Number(attrDict.get(current)));
  }, ee.Number(0));
  return ee.Feature(
      geometry,
      attrDict.set('GEOID', feature.get('GEOID'))
          .set('SNAP', feature.get(resources.snapKey))
          .set('TOTAL', feature.get(resources.totalKey))
          .set('BUILDING_COUNT', totalBuildings));
}

/** Performs operation of processing inputs and creating output asset. */
function run() {
  console.log('run');

  ee.initialize();

  if (disaster === 'harvey') {
    oldImportData();
  } else {
    const resources = disasters.get(disaster);
    const damage = ee.FeatureCollection(resources.damageAsset);
    const rawSnap = ee.FeatureCollection(resources.rawSnapAsset)
                        .filterBounds(damage.geometry());
    const assetName = disaster + '-snap-and-damage';

    const task = ee.batch.Export.table.toAsset(
        rawSnap.map(countDamageAndBuildings), assetName,
        'users/juliexxia/' + assetName);
    task.start();
    $('.upload-status')
        .text('Check Code Editor console for progress. Task: ' + task.id);
    rawSnap.size().evaluate(function(val, failure) {
      if (val) {
        $('.upload-status').append('\n<p>Found ' + val + ' elements');
      } else {
        $('.upload-status').append('\n<p>Error getting size: ' + failure);
      }
    });
  }
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
