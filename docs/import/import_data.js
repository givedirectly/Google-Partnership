import {gdEePathPrefix} from '../ee_paths.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getDisaster} from '../resources.js';

import {getDamageBounds, getLatLngBoundsPromiseFromEeRectangle, saveBounds} from './center.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';
import {getStateBlockGroupsFromNationalBlocks} from './import_data_state_computations.js';

export {enableWhenReady};
/** @VisibleForTesting */
export {countDamageAndBuildings, run};

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
        ee.Algorithms.If(
            totalBuildings, ee.Number(damagedBuildings).divide(totalBuildings),
            1));
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

/**
 * Performs operation of processing inputs and creating output asset.
 * @param {Object} disasterData Data for current disaster coming from Firestore
 * @return {boolean} Whether in-thread operations succeeded
 * */
function run(disasterData) {
  $('.compute-status').html('');
  const states = disasterData['states'];
  if (!states) {
    return missingAssetError('affected states');
  }
  const assetData = disasterData['asset_data'];
  if (!assetData) {
    return missingAssetError('SNAP/damage asset paths');
  }
  const blockData = assetData['block_data'];
  if (!blockData) {
    return missingAssetError('Census block geometries');
  }
  const censusShapefileAsset = blockData['path'];
  if (!censusShapefileAsset) {
    return missingAssetError('TIGER Census Blocks');
  }
  const censusStateKey = blockData['state_key'];
  if (!censusStateKey) {
    return missingAssetError('TIGER Census state key');
  }
  const censusBlockIdKey = blockData['blockid_key'];
  if (!censusBlockIdKey) {
    return missingAssetError('TIGER Census block id key');
  }
  const censusBlockOnlyKey = blockData['blockonly_key'];
  if (!censusBlockOnlyKey) {
    return missingAssetError('TIGER Census block-only key');
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
  const {damage, mapBoundsRectangle} = calculateDamage(assetData);
  if (!mapBoundsRectangle) {
    // Must have been an error.
    return false;
  }

  // Filter block groups to those in damage rectangle.
  const censusBlocks = ee.FeatureCollection(censusShapefileAsset)
                           .filterBounds(mapBoundsRectangle);

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

    const stateGroups = getStateBlockGroupsFromNationalBlocks(
        censusBlocks, state, censusStateKey, censusBlockIdKey,
        censusBlockOnlyKey);

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
    // allStatesProcessing =
    // allStatesProcessing.merge(ee.FeatureCollection(sviPath));

    processing = innerJoin(processing, sviPath, tractTag, cdcGeoidKey);
    processing = processing.map((f) => combineWithAsset(f, sviTag, sviKey));

    // Get building count by block group.
    const buildingsHisto = computeBuildingsHisto(
        mapBoundsRectangle, buildingPath, state, stateGroups);

    // Create final feature collection.
    processing = processing.map(
        (f) => countDamageAndBuildings(f, damage, buildingsHisto));
    allStatesProcessing = allStatesProcessing.merge(processing);
  }

  const assetName = 'data-ms-as-tot-refactor-few';
  const scoreAssetPath = gdEePathPrefix + getDisaster() + '/' + assetName;
  try {
    ee.data.deleteAsset(scoreAssetPath);
  } catch (err) {
    if (err.message !== 'Asset not found.') {
      throw err;
    }
    console.log(scoreAssetPath + ' not found to delete');
  }
  const task = ee.batch.Export.table.toAsset(
      allStatesProcessing, assetName, scoreAssetPath);
  task.start();
  $('.upload-status')
      .text('Check Code Editor console for upload progress. Task: ' + task.id);
  return true;
}

const damageError = {
  damage: null,
  mapBoundsRectangle: null,
};

/**
 * Calculates damage if there is a damage asset, or simply writes the
 * user-provided bounds to Firestore if not.
 * @param {Object} assetData
 * @return {{damage: ?ee.FeatureCollection, mapBoundsRectangle:
 *     ee.Geometry.Rectangle}|{damage: null, mapBoundsRectangle: null}} Returns
 *     the damage asset (if present) and the rectangle bounding the damage, or
 *     both null if an error occurs
 */
function calculateDamage(assetData) {
  const damagePath = assetData['damage_asset_path'];
  const centerStatusSpan = document.createElement('span');
  const centerStatusLabel = document.createElement('span');
  $('.compute-status').append(centerStatusLabel).append(centerStatusSpan);
  centerStatusSpan.innerText = 'in progress';
  const firestoreError = (err) => centerStatusSpan.innerText +=
      'Error writing bounds to Firestore: ' + err;
  if (damagePath) {
    const damage = ee.FeatureCollection(damagePath);
    // Uncomment to test with a restricted damage set (only a few block groups'
    // worth).
    // damage = damage.filterBounds(
    //     ee.FeatureCollection('users/gd/2017-harvey/data-ms-as-nod')
    //         .filterMetadata('GEOID', 'starts_with', '482015417002'));
    centerStatusLabel.innerText = 'Computing and storing bounds of map: ';
    const mapBoundsRectangle = getDamageBounds(damage);
    const damageBoundsPromise =
        getLatLngBoundsPromiseFromEeRectangle(mapBoundsRectangle);
    damageBoundsPromise.then(
        (bounds) => centerStatusSpan.innerText =
            'Found bounds ' + formatGeoNumbers(bounds));
    damageBoundsPromise.then(saveBounds).catch(firestoreError);
    return {damage, mapBoundsRectangle};
  }
  centerStatusLabel.innerText = 'Storing bounds of map: ';
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
  saveBounds({sw, ne}).catch(firestoreError);
  return {
    damage: null,
    mapBoundsRectangle: ee.Geometry.Rectangle([sw.lng, sw.lat, ne.lng, ne.lat]),
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
 * @param {ee.Geometry.Rectangle} mapBoundsRectangle Area we are concerned with
 * @param {string} buildingPath location of buildings asset in EE
 * @param {string} state
 * @param {ee.FeatureCollection} stateGroups Collection with block groups
 * @return {ee.Dictionary} Number of buildings per block group
 */
function computeBuildingsHisto(
    mapBoundsRectangle, buildingPath, state, stateGroups) {
  const buildings =
      ee.FeatureCollection(buildingPath).filterBounds(mapBoundsRectangle);
  const withBlockGroup =
      ee.Join.saveFirst('bg')
          .apply(
              buildings, stateGroups,
              ee.Filter.intersects({leftField: '.geo', rightField: '.geo'}))
          .map((f) => f.set(geoidTag, ee.Feature(f.get('bg')).get(geoidTag)));
  return ee.Dictionary(withBlockGroup.aggregate_histogram(geoidTag));
}

/**
 * Displays error to the user coming from incomplete asset entry.
 * @param {string} str Fragment of error message
 * @return {boolean} Return value can be ignored, but is present so that
 *     callers can write "return missingAssetError" and save a line
 */
function missingAssetError(str) {
  $('.compute-status')
      .html(
          'Error! Please specify ' + str +
          ' at <a href="./add_disaster.html">add_disaster.html</a>');
  return false;
}

/**
 * Displays latitude/longitude in a reasonable way.
 * @param {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}}
 *     latLngBounds
 * @return {string} numbers rounded to 2 digits. https://xkcd.com/2170/.
 */
function formatGeoNumbers(latLngBounds) {
  return formatLatLng(latLngBounds.sw) + ', ' + formatLatLng(latLngBounds.ne);
}

/**
 * Formats a LatLng for display.
 * @param {{lat: number, lng: number}} latLng
 * @return {string} numbers rounded to 2 digits. https://xkcd.com/2170/.
 */
function formatLatLng(latLng) {
  return '(' + latLng.lat.toFixed(2) + ', ' + latLng.lng.toFixed(2) + ')';
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
