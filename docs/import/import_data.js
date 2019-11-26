import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getScoreAsset} from '../resources.js';

import {computeAndSaveBounds, saveBounds} from './center.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';

export {enableWhenReady};
/** @VisibleForTesting */
export {countDamageAndBuildings, run};

/**
 * TODO: This should be moved to a user-readable doc and expanded.
 * Processes all user-entered data to construct the "score" asset in EarthEngine
 * and write map bounds for the disaster to Firestore. Mandatory state-level
 * data (needs to be present for every affected state):
 * 1. Census block group shapes (TIGER shapefile).
 * 2. Census SNAP data, at the block group level.
 * 3. SVI data, at the Census tract level.
 * 4. Income data, at the block group level.
 * 5. FeatureCollection of all buildings.
 *
 * Current workflow for a new disaster
 *
 * 1. download SNAP data from american fact finder (2016 ACS 5-year estimates)
 *      https://factfinder.census.gov/faces/nav/jsf/pages/download_center.xhtml
 * 2. clean up illegal property names in (0) by running ./cleanup_acs.sh
 *    /path/to/snap/data.csv
 * 3. download TIGER block group .shp from census website
 *      https://www.census.gov/cgi-bin/geo/shapefiles/index.php
 * 4. download crowd ai damage data .shp file
 * 5. upload results of (2), (3), and (4) to EarthEngine via the code editor
 * 5. visit http://localhost:8080/import/add_disaster.html and fill out all
 * required fields
 * 6. visit http://localhost:8080/import/import_data.html and submit the page.
 * 7. make the created asset readable by all in the code editor.
 */

/**
 * Given a feature from the SNAP census data, returns a new
 * feature with GEOID, SNAP #, total pop #, total building count, building
 * counts for all damage categories, and SNAP percentage and damage percentage.
 *
 * @param {ee.Feature} feature
 * @param {ee.FeatureCollection} damage
 * @param {ee.Dictionary} buildings geoid -> # buildings
 * @return {ee.Feature}
 */
function countDamageAndBuildings(feature, damage, buildings) {
  const geometry = feature.geometry();
  const snapPop = ee.Number.parse(feature.get(snapPopTag)).long();
  const totalPop = ee.Number.parse(feature.get(totalPopTag)).long();
  const geoId = feature.get(geoidTag);
  const totalBuildings = ee.Algorithms.If(
      buildings.contains(geoId), buildings.get(geoId), ee.Number(0));
  let properties =
      ee.Dictionary()
          .set(geoidTag, geoId)
          .set(blockGroupTag, feature.get(blockGroupTag))
          .set(snapPopTag, ee.Number(snapPop))
          .set(totalPopTag, ee.Number(totalPop))
          .set(snapPercentageTag, ee.Number(snapPop).divide(totalPop))
          // These entries can't be parsed to numbers easily because have some
          // non-number values like "-" :(
          .set(incomeTag, feature.get(incomeTag))
          .set(sviTag, feature.get(sviTag))
          .set(buildingCountTag, totalBuildings);
  if (damage) {
    const damagedBuildings =
        ee.FeatureCollection(damage).filterBounds(geometry).size();
    properties = properties.set(
        damageTag,
        // If no buildings, this is probably spurious. Don't give any damage.
        // We don't expect totalBuildings to be 0 in production, but it's bitten
        // us when working with partial buildings datasets. If this starts
        // showing up in production, we may need to surface it to user somehow.
        ee.Algorithms.If(
            totalBuildings, ee.Number(damagedBuildings).divide(totalBuildings),
            0));
  } else {
    properties = properties.set(damageTag, 0);
  }
  return ee.Feature(geometry, properties);
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
  return feature.set(tractTag, ee.String(feature.get(geoidTag)).slice(0, -1));
}

let setMapBoundsInfoCalled = false;

/**
 * Utility function that sets the label for the bounds status the first time it
 * is called, then sets the status the second time. Useful for injecting over in
 * tests.
 * @param {string} message Description of task to be done the first time this is
 *     called, and then result the second time
 */
function setMapBoundsInfo(message) {
  if (setMapBoundsInfoCalled) {
    $('#bounds-status-span').text(message);
  } else {
    const boundsStatusSpan = document.createElement('span');
    const boundsStatusLabel = document.createElement('span');
    boundsStatusSpan.id = 'bounds-status-span';
    $('#compute-status').append(boundsStatusLabel).append(boundsStatusSpan);
    boundsStatusSpan.innerText = 'in progress...';
  }
}

/**
 * Performs operation of processing inputs and creating output asset.
 * @param {Object} disasterData Data for current disaster coming from Firestore
 * @param {Function} setMapBoundsInfoFunction Function to be called when map
 *     bounds-related operations are complete. First called with a message about
 *     the task, then called with the results
 * @return {boolean} Whether in-thread operations succeeded
 */
function run(disasterData, setMapBoundsInfoFunction = setMapBoundsInfo) {
  $('#compute-status').html('');
  const states = disasterData['states'];
  if (!states) {
    return missingAssetError('affected states');
  }
  const assetData = disasterData['asset_data'];
  if (!assetData) {
    return missingAssetError('SNAP/damage asset paths');
  }
  const blockGroupPaths = assetData['block_group_asset_paths'];
  if (!blockGroupPaths) {
    return missingAssetError('Census TIGER block group shapefiles');
  }
  const snapData = assetData['snap_data'];
  if (!snapData) {
    return missingAssetError('SNAP info');
  }
  const snapPaths = snapData['paths'];
  if (!snapPaths) {
    return missingAssetError('SNAP table asset paths');
  }
  const snapKey = snapData['snap_key'];
  if (!snapKey) {
    return missingAssetError('column name for SNAP recipients in SNAP table');
  }
  const totalKey = snapData['total_key'];
  if (!totalKey) {
    return missingAssetError('column name for total population in SNAP table');
  }
  const sviPaths = assetData['svi_asset_paths'];
  if (!sviPaths) {
    return missingAssetError('SVI table asset paths');
  }
  const sviKey = assetData['svi_key'];
  if (!sviKey) {
    return missingAssetError('column name for SVI table');
  }
  const incomePaths = assetData['income_asset_paths'];
  if (!incomePaths) {
    return missingAssetError('income table asset paths');
  }
  const incomeKey = assetData['income_key'];
  if (!incomeKey) {
    return missingAssetError('column name for income table');
  }
  // If we switch to CrowdAI data, this will change.
  const buildingPaths = assetData['building_asset_paths'];
  if (!buildingPaths) {
    return missingAssetError('building data asset paths');
  }
  const {damage, damageEnvelope} =
      calculateDamage(assetData, setMapBoundsInfoFunction);
  if (!damageEnvelope) {
    // Must have been an error.
    return false;
  }

  let allStatesProcessing = ee.FeatureCollection([]);
  for (const state of states) {
    const snapPath = snapPaths[state];
    if (!snapPath) {
      return missingAssetError('SNAP asset path for ' + state);
    }
    const sviPath = sviPaths[state];
    if (!sviPath) {
      return missingAssetError('SVI asset path for ' + state);
    }
    const incomePath = incomePaths[state];
    if (!incomePath) {
      return missingAssetError('income asset path for ' + state);
    }
    const buildingPath = buildingPaths[state];
    if (!buildingPath) {
      return missingAssetError('building asset path for ' + state);
    }
    const blockGroupPath = blockGroupPaths[state];
    if (!blockGroupPath) {
      return missingAssetError(
          'Census TIGER block group shapefile for ' + state);
    }

    const stateGroups =
        ee.FeatureCollection(blockGroupPath).filterBounds(damageEnvelope);

    let processing = ee.FeatureCollection(snapPath).map(stringifyGeoid);

    // Join snap stats to block group geometries.
    processing =
        innerJoin(processing, stateGroups, censusGeoidKey, tigerGeoidKey);
    processing = processing.map((f) => combineWithSnap(f, snapKey, totalKey));
    // Join with income.
    // TODO: make income formatting prettier so it looks like a currency value.
    //  Not trivial because it has some non-valid values like '-'.
    processing = innerJoin(processing, incomePath, geoidTag, censusGeoidKey);
    processing =
        processing.map((f) => combineWithAsset(f, incomeTag, incomeKey));
    // Join with SVI (data is at the tract level).
    processing = processing.map(addTractInfo);

    processing = innerJoin(processing, sviPath, tractTag, cdcGeoidKey);
    processing = processing.map((f) => combineWithAsset(f, sviTag, sviKey));

    // Get building count by block group.
    const buildingsHisto =
        computeBuildingsHisto(damageEnvelope, buildingPath, stateGroups);

    // Create final feature collection.
    processing = processing.map(
        (f) => countDamageAndBuildings(f, damage, buildingsHisto));
    allStatesProcessing = allStatesProcessing.merge(processing);
  }

  const scoreAssetPath = getScoreAsset();
  try {
    ee.data.deleteAsset(scoreAssetPath);
  } catch (err) {
    if (err.message === 'Asset not found.') {
      console.log('Old ' + scoreAssetPath + ' not present, did not delete it');
    } else {
      throw err;
    }
  }
  const task = ee.batch.Export.table.toAsset(
      allStatesProcessing,
      scoreAssetPath.substring(scoreAssetPath.lastIndexOf('/')),
      scoreAssetPath);
  task.start();
  $('#upload-status')
      .text('Check Code Editor console for upload progress. Task: ' + task.id);
  return true;
}

const damageError = {
  damage: null,
  damageEnvelope: null,
};

// Distance in meters away from damage point that we are still interested in
// collecting information.
const damageBuffer = 1000;

/**
 * Calculates damage if there is a damage asset, or simply writes the
 * user-provided bounds to Firestore if not.
 * @param {Object} assetData
 * @param {Function} setMapBoundsInfo Function to call with information about
 *     map bounds work. First call will have the task, second call the result.
 * @return {{damage: ?ee.FeatureCollection, damageEnvelope:
 *     ee.Geometry.Rectangle}|{damage: null, damageEnvelope: null}} Returns
 *     the damage asset (if present) and the envelope bounding the damage, or
 *     both null if an error occurs
 */
function calculateDamage(assetData, setMapBoundsInfo) {
  const damagePath = assetData['damage_asset_path'];
  if (damagePath) {
    const damage = ee.FeatureCollection(damagePath);
    // Uncomment to test with a restricted damage set (14 block groups' worth).
    // damage = damage.filterBounds(
    //     ee.FeatureCollection('users/gd/2017-harvey/data-ms-as-nod')
    //         .filterMetadata('GEOID', 'starts_with', '482015417002'));
    setMapBoundsInfo('Computing and storing bounds of map: ');
    computeAndSaveBounds(damage)
        .then(displayGeoNumbers)
        .then((bounds) => setMapBoundsInfo('Found bounds ' + bounds))
        .catch(setMapBoundsInfo);
    return {damage, damageEnvelope: damage.geometry().buffer(damageBuffer)};
  }
  // TODO(janakr): in the no-damage case, we're storing a rectangle, but
  //  experiments show that, at least for Harvey, the page is very slow when we
  //  load the entire rectangle around the damage. Maybe allow users to select a
  //  polygon so they can draw a tighter area?
  setMapBoundsInfo('Storing bounds of map: ');
  const damageSw = assetData['map_bounds_sw'];
  if (!damageSw) {
    missingAssetError(
        'damage asset or map bounds must be specified (southwest corner ' +
        'missing');
    return damageError;
  }
  const damageNe = assetData['map_bounds_ne'];
  if (!damageNe) {
    missingAssetError(
        'damage asset or map bounds must be specified (northeast corner ' +
        'missing)');
    return damageError;
  }
  const sw = makeLatLngFromString(damageSw);
  const ne = makeLatLngFromString(damageNe);
  const damageEnvelope =
      ee.Geometry.Rectangle([sw.lng, sw.lat, ne.lng, ne.lat]);
  saveBounds(makeGeoJsonRectangle(sw, ne))
      .then(() => setMapBoundsInfo('Wrote bounds'))
      .catch(setMapBoundsInfo);
  return {
    damage: null,
    damageEnvelope: damageEnvelope,
  };
}

/**
 * Creates a GeoJson-style rectangle from the southwest and northeast corners.
 * @param {{lat: number, lng: number}} sw
 * @param {{lat: number, lng: number}} ne
 * @return {Object} GeoJson Polygon
 */
function makeGeoJsonRectangle(sw, ne) {
  return {
    type: 'Polygon',
    coordinates: [[
      [sw.lng, sw.lat],
      [ne.lng, sw.lat],
      [ne.lng, ne.lat],
      [sw.lng, ne.lat],
      [sw.lng, sw.lat],
    ]],
  };
}

/**
 * Attaches block groups to buildings and aggregates to get per-block group
 * building counts.
 *
 * Joins the buildings to block groups using a "saveFirst" join, since each
 * building should be in only one block group, then constructs a histogram based
 * on the appended block group features.
 *
 * This method will go away or be greatly changed if we're using CrowdAI data
 * instead of previously computed building data.
 * @param {ee.Geometry.Polygon} damageEnvelope Area we are concerned with
 * @param {string} buildingPath location of buildings asset in EE
 * @param {ee.FeatureCollection} stateGroups Collection with block groups
 * @return {ee.Dictionary} Number of buildings per block group
 */
function computeBuildingsHisto(damageEnvelope, buildingPath, stateGroups) {
  const buildings =
      ee.FeatureCollection(buildingPath).filterBounds(damageEnvelope);
  const field = 'fieldToSaveBlockGroupUnder';
  const withBlockGroup =
      ee.Join.saveFirst(field)
          .apply(
              buildings, stateGroups,
              ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}))
          .map((f) => f.set(geoidTag, ee.Feature(f.get(field)).get(geoidTag)));
  return ee.Dictionary(withBlockGroup.aggregate_histogram(geoidTag));
}

/**
 * Displays error to the user coming from incomplete asset entry.
 * @param {string} str Fragment of error message
 * @return {boolean} Return value can be ignored, but is present so that
 *     callers can write "return missingAssetError" and save a line
 */
function missingAssetError(str) {
  $('#compute-status')
      .html(
          'Error! Please specify ' + str +
          ' at <a href="./add_disaster.html">add_disaster.html</a>');
  return false;
}

/**
 * Makes a LatLng-style object from the given string.
 * @param {string} str Comma-separated string of the form "lat, lng", which is
 *     what Google Maps provides pretty easily
 * @return {{lng: *, lat: *}}
 */
function makeLatLngFromString(str) {
  const elts = str.split(/ *, */).map(Number);
  return {lat: elts[0], lng: elts[1]};
}

/**
 * Performs an inner join on the given collections (creating a collection from
 * {@code collection2} if necessary), on the given keys.
 * @param {ee.FeatureCollection} collection1
 * @param {ee.FeatureCollection|string} collection2
 * @param {string} key1
 * @param {string} key2
 * @return {ee.FeatureCollection}
 */
function innerJoin(collection1, collection2, key1, key2) {
  return ee.Join.inner().apply(
      collection1, ee.FeatureCollection(collection2),
      ee.Filter.equals({leftField: key1, rightField: key2}));
}

/**
 * Enables the button to kick off calculations.
 * @param {firebase.firestore.DocumentSnapshot} firebaseDataDoc Contents of
 *     Firestore for current disaster, used when calculating
 */
function enableWhenReady(firebaseDataDoc) {
  const processButton = $('#process-button');
  processButton.prop('disabled', false);
  processButton.on('click', () => {
    // Disable button to avoid over-clicking. User can reload page if needed.
    processButton.prop('disabled', true);
    // run does a fair amount of work, so this isn't great for UI responsiveness
    // but what to do.
    run(firebaseDataDoc.data());
  });
}

/**
 * Displays latitude/longitude in a reasonable way. https://xkcd.com/2170/.
 * @param {Array<Array<number>>} latLngs
 * @return {string} numbers truncated to 2 digits, latitude first, joined.
 */
function displayGeoNumbers(latLngs) {
  return latLngs
      .map(
          (coords) =>
              '(' + coords[1].toFixed(2) + ', ' + coords[0].toFixed(2) + ')')
      .join(', ');
}
