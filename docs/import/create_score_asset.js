import {blockGroupTag, damageTag, geoidTag, povertyHouseholdsTag, povertyPercentageTag, totalHouseholdsTag} from '../property_names.js';
import {getBackupScoreAssetPath, getScoreAssetPath} from '../resources.js';

import {computeAndSaveBounds} from './center.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';

export {createScoreAsset, setStatus};
// For testing.
export {backUpAssetAndStartTask};

const TRACT_TAG = 'TRACT';
const SVI_TAG = 'SVI';
// Median household income in the past 12 months (in 2016 inflation-adjusted
// dollars)
const INCOME_TAG = 'MEDIAN INCOME';

/**
 * For the given feature representing a block group, add properties for
 * total # buildings in the block group and # damaged buildings in the block
 * group.
 * @param {ee.Feature} feature
 * @param {?ee.FeatureCollection} damage Damage asset, or null if damage not
 *     known
 * @param {?ee.Dictionary} buildings geoid -> # buildings or null if buildings
 *     asset not present. If damage present, this must be too
 * @param {Array<string>} additionalTags
 * @return {ee.Feature}
 */
function countDamageAndBuildings(feature, damage, buildings, additionalTags) {
  const geometry = feature.geometry();
  const geoId = feature.get(geoidTag);
  let totalBuildings;
  if (buildings) {
    totalBuildings = ee.Algorithms.If(
        buildings.contains(geoId), buildings.get(geoId), ee.Number(0));
  }
  let properties = ee.Dictionary()
                       .set(geoidTag, geoId)
                       .set(blockGroupTag, feature.get(blockGroupTag));
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
  const snapPop = feature.get(povertyHouseholdsTag);
  const totalPop = feature.get(totalHouseholdsTag);
  // unfortunately, just using .contains(null) here throws an error.
  const snapPercentage = ee.Algorithms.If(
      ee.List([snapPop, totalPop]).containsAll([null]), null,
      ee.Number(snapPop).long().divide(ee.Number(totalPop).long()));
  // The following properties may have null values (as a result of {@code
  // convertToNumber or absent assets} so must be set directly on feature, not
  // in dictionary.
  let result = ee.Feature(geometry, properties)
                   .set(povertyHouseholdsTag, snapPop)
                   .set(totalHouseholdsTag, totalPop)
                   .set(povertyPercentageTag, snapPercentage);
  if (buildings) {
    result = result.set('BUILDING COUNT', totalBuildings);
  }
  additionalTags.forEach((tag) => result = result.set(tag, feature.get(tag)));
  return result;
}

// Permissive number regexp: matches optional +/- followed by 0 or more digits
// followed by optional period with 0 or more digits. Corresponds to valid
// inputs to ee.Number.parse. Like ee.Number.parse, the empty string is not
// allowed.
const numberRegexp = '^[+-]?(([0-9]*)?[0-9](\.[0-9]*)?|\.[0-9]+)$';

// Regexp that matches any string that ends in a '+' or '-'.
const endsWithPlusMinusRegexp = '[+-]$';

/**
 * First strips out all ',' and whitespace. Then strips any trailing '-' or '+'
 * (for threshold values like '250,000+'). Then checks if the result matches
 * our regexp for valid EE numbers. If it does, parse and return number, else
 * return null.
 * @param {string} value
 * @return {?ee.Number}
 */
function convertToNumber(value) {
  value = ee.String(value).trim().replace(',', '', 'g');
  value = ee.String(ee.Algorithms.If(
      value.match(endsWithPlusMinusRegexp), ee.String(value.slice(0, -1)),
      ee.String(value)));
  return ee.Algorithms.If(
      ee.String(value).length().and(value.match(numberRegexp).length()),
      ee.Number.parse(value), null);
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
        povertyHouseholdsTag,
        convertToNumber(snapFeature.get(snapKey)),
        totalHouseholdsTag,
        convertToNumber(ee.Number.parse(snapFeature.get(totalKey))),
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
  const featureWithNewData = ee.Feature(feature.get('secondary'));
  return ee.Feature(feature.get('primary')).set(ee.Dictionary([
    tag,
    convertToNumber(featureWithNewData.get(key)),
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
  return feature.set(TRACT_TAG, ee.String(feature.get(geoidTag)).slice(0, -1));
}

/**
 * Displays error to the user coming from incomplete asset entry.
 * @param {string} str Fragment of error message
 * @return {null} Return value can be ignored, but is present so that
 *     callers can write "return missingAssetError" and save a line
 */
function missingAssetError(str) {
  setStatus('Error! Please specify ' + str);
  return null;
}

/**
 * Displays status message to user.
 * @param {string} str message
 */
function setStatus(str) {
  $('#compute-status').text(str);
}

/**
 * Utility function that sets the label for the bounds status the first time it
 * is called, then sets the status the second time. Useful for injecting over in
 * tests.
 * @param {string} message Description of task to be done the first time this is
 *     called, and then result the second time
 */
function setMapBoundsInfo(message) {
  const boundsStatusElement = $('#bounds-status-span');
  if (!boundsStatusElement.length) {
    // Haven't done anything yet, create and initialize.
    const boundsStatusSpan = document.createElement('span');
    const boundsStatusLabel = document.createElement('span');
    boundsStatusSpan.id = 'bounds-status-span';
    $('#compute-status').append(boundsStatusLabel).append(boundsStatusSpan);
    boundsStatusSpan.innerText = 'in progress...';
    boundsStatusLabel.innerText = message;
  } else {
    boundsStatusElement.text(message);
  }
}

/**
 * Performs operation of processing inputs and creating output asset.
 * @param {Object} disasterData Data for current disaster coming from Firestore
 * @param {Function} setMapBoundsInfoFunction Function to be called when map
 *     bounds-related operations are complete. First called with a message about
 *     the task, then called with the results
 * @return {?Promise<ee.batch.ExportTask>} Promise for task of asset write.
 */
function createScoreAsset(
    disasterData, setMapBoundsInfoFunction = setMapBoundsInfo) {
  setStatus('');
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
    return null;
  }
  let allStatesProcessing = ee.FeatureCollection([]);
  for (const state of states) {
    const snapPath = snapPaths[state];
    if (!snapPath) {
      return missingAssetError('SNAP asset path for ' + state);
    }
    const sviPath = sviPaths[state];
    const incomePath = incomePaths[state];
    const buildingPath = buildingPaths[state];
    if (damage && !buildingPath) {
      // TODO(janakr): We could allow buildings asset to be absent even when
      //  damage is present and calculate damage percentage based on household
      //  count. But does GD want that? We'd have to warn on score kick-off so
      //  users knew they were getting a less accurate damage percentage count.
      return missingAssetError(
          'buildings must be specified for ' + state +
          ' if damage asset is present');
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
    if (incomePath) {
      // Join with income.
      processing = innerJoin(processing, incomePath, geoidTag, censusGeoidKey);
      processing =
          processing.map((f) => combineWithAsset(f, INCOME_TAG, incomeKey));
    }
    if (sviPath) {
      // Join with SVI (data is at the tract level).
      processing = processing.map(addTractInfo);

      processing = innerJoin(processing, sviPath, TRACT_TAG, cdcGeoidKey);
      processing = processing.map((f) => combineWithAsset(f, SVI_TAG, sviKey));
    }

    // Get building count by block group.
    const buildingsHisto =
        buildingPath ? computeBuildingsHisto(buildingPath, stateGroups) : null;

    // Create final feature collection.
    const additionalTags = [];
    if (incomePath) additionalTags.push(INCOME_TAG);
    if (sviPath) additionalTags.push(SVI_TAG);
    processing = processing.map(
        (f) =>
            countDamageAndBuildings(f, damage, buildingsHisto, additionalTags));
    allStatesProcessing = allStatesProcessing.merge(processing);
  }

  return backUpAssetAndStartTask(allStatesProcessing);
}

/**
 * Renames current score asset to backup location, deleting backup if necessary,
 * and kicks off export task.
 * @param {ee.FeatureCollection} featureCollection Collection to export
 * @return {Promise<!ee.batch.ExportTask>} Promise that resolves with task if
 *     rename dance was successful
 */
function backUpAssetAndStartTask(featureCollection) {
  const scoreAssetPath = getScoreAssetPath();
  const oldScoreAssetPath = getBackupScoreAssetPath();
  const task = ee.batch.Export.table.toAsset(
      featureCollection,
      scoreAssetPath.substring(scoreAssetPath.lastIndexOf('/') + 1),
      scoreAssetPath);
  return renameAssetAsPromise(scoreAssetPath, oldScoreAssetPath)
      .catch((renameErr) => {
        // These checks aren't perfect detection, but best we can do.
        if (renameErr.includes('does not exist')) {
          console.log('Old ' + scoreAssetPath + ' not found, did not move it');
        } else if (renameErr.includes('Cannot overwrite asset')) {
          // Delete and try again.
          return new Promise(
              (deleteResolve, deleteReject) =>
                  ee.data.deleteAsset(oldScoreAssetPath, (_, deleteErr) => {
                    if (deleteErr) {
                      // Don't try to recover here.
                      // Don't show deletion error to user, rename error is what
                      // we'll display, but log deletion error here.
                      console.error(deleteErr);
                      const message =
                          'Error moving old score asset: ' + renameErr;
                      setStatus(message);
                      deleteReject(message);
                    } else {
                      // Delete succeeded, try again.
                      deleteResolve(renameAssetAsPromise(
                          scoreAssetPath, oldScoreAssetPath));
                    }
                  }));
        } else {
          const message = 'Error moving old score asset: ' + renameErr;
          setStatus(message);
          throw renameErr;
        }
      })
      .then(() => {
        task.start();
        $('#upload-status')
            .text(
                'Check Code Editor console for upload progress. Task: ' +
                task.id);
        return task;
      });
}

/**
 * Converts {@link ee.data.renameAsset} into a Promise, by resolving/rejecting
 * in its callback.
 * @param {string} from See {@link ee.data.renameAsset}
 * @param {string} to See {@link ee.data.renameAsset}
 * @return {Promise<?Object>} Promise that resolves if rename is successful,
 *     and completes with rejection if there is an error. The rejection is
 *     just a string, not an `Error` because that is what EarthEngine does. The
 *     resolve will typically be with an Object that has information about the
 *     renamed asset, but EarthEngine doesn't guarantee that
 */
function renameAssetAsPromise(from, to) {
  return new Promise(
      (resolve, reject) => ee.data.renameAsset(from, to, (success, err) => {
        if (err) {
          reject(err);
        } else {
          resolve(success);
        }
      }));
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
  let geometry;
  let damage = null;
  let damageEnvelope;
  if (damagePath) {
    damage = ee.FeatureCollection(damagePath);
    // Uncomment to test with a restricted damage set (14 block groups' worth).
    // damage = damage.filterBounds(
    //     ee.FeatureCollection('users/gd/2017-harvey/data-ms-as-nod')
    //         .filterMetadata('GEOID', 'starts_with', '482015417002'));
    geometry = damage.geometry();
    damageEnvelope = damage.geometry().buffer(damageBuffer);
  } else {
    const scoreBounds = assetData['score_bounds_coordinates'];
    if (!scoreBounds) {
      missingAssetError('specify damage asset or draw bounds on map');
      return damageError;
    }
    const coordinates = [];
    scoreBounds.forEach(
        (geopoint) => coordinates.push(geopoint.longitude, geopoint.latitude));
    damageEnvelope = ee.Geometry.Polygon(coordinates);
    geometry = damageEnvelope;
  }
  setMapBoundsInfo('Computing and storing bounds of map: ');
  computeAndSaveBounds(geometry)
      .then(
          (bounds) =>
              setMapBoundsInfo('Found bounds ' + displayGeoNumbers(bounds)))
      .catch(setMapBoundsInfo);
  return {damage, damageEnvelope};
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
 * @param {string} buildingPath location of buildings asset in EE
 * @param {ee.FeatureCollection} stateGroups Collection with block groups
 * @return {ee.Dictionary} Number of buildings per block group
 */
function computeBuildingsHisto(buildingPath, stateGroups) {
  const buildings = ee.FeatureCollection(buildingPath);
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
