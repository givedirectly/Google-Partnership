import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getBackupScoreAssetPath, getScoreAssetPath} from '../resources.js';
import {computeAndSaveBounds} from './center.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';

export {
  createScoreAssetForFlexibleDisaster,
  createScoreAssetForStateBasedDisaster,
  setStatus,
};
// For testing.
export {backUpAssetAndStartTask};

/**
 * Given a dictionary of building counts per district, attach the count to each
 * district in the collection.
 * @param {ee.FeatureCollection} featureCollection The features'
 *     {@link geoidTag} are the keys of `buildingsHisto`
 * @param {ee.Dictionary} buildingsHisto Each entry gives how many buildings are
 *     in the feature whose {@link geoidTag} property is the entry's key
 * @return {ee.FeatureCollection}
 */
function combineWithBuildings(featureCollection, buildingsHisto) {
  return featureCollection.map((f) => {
    const geoId = f.get(geoidTag);
    return f.set(
        buildingCountTag,
        ee.Algorithms.If(
            buildingsHisto.contains(geoId), buildingsHisto.get(geoId),
            ee.Number(0)));
  });
}

/**
 * Given an in-progress score asset, adds in the damage percentage. The damage
 * asset may include undamaged buildings, in which case we must filter them out
 * via the `damageLevelsKey` and `noDamageValue` parameters.
 * @param {ee.FeatureCollection} featureCollection Score asset being created
 * @param {ee.FeatureCollection} damage Damage collection, which may includes
 *     undamaged buildings
 * @param {?string} damageLevelsKey Property in damage collection whose value
 *     can identify undamaged buildings
 * @param {?string} noDamageValue Value for `damageLevelsKey` that indicates a
 *     building is undamaged
 * @return {ee.FeatureCollection}
 */
function combineWithDamage(
    featureCollection, damage, damageLevelsKey, noDamageValue) {
  return featureCollection.map((f) => {
    let damageForDistrict =
        ee.FeatureCollection(damage).filterBounds(f.geometry());
    if (damageLevelsKey) {
      damageForDistrict = damageForDistrict.filterMetadata(
          damageLevelsKey, 'not_equals', noDamageValue);
    }
    return addDamageTag(f, damageForDistrict.size());
  });
}

/**
 * Given an in-progress score asset, adds in the damage percentage and total
 * building count, where the building count is computed from the damage asset,
 * which must include all relevant buildings, including undamaged ones.
 * @param {ee.FeatureCollection} featureCollection Score asset being created
 * @param {ee.FeatureCollection} damage Damage collection, which includes all
 *     buildings
 * @param {string} damageLevelsKey Property in damage collection whose value can
 *     identify undamaged buildings
 * @param {string} noDamageValue Value for `damageLevelsKey` that indicates a
 *     building is undamaged
 * @return {ee.FeatureCollection}
 */
function combineWithDamageAndUseForBuildings(
    featureCollection, damage, damageLevelsKey, noDamageValue) {
  return featureCollection.map((f) => {
    const damageForDistrict =
        ee.FeatureCollection(damage).filterBounds(f.geometry());
    const totalBuildings = damageForDistrict.size();
    const damagedBuildings =
        damageForDistrict
            .filterMetadata(damageLevelsKey, 'not_equals', noDamageValue)
            .size();
    return addDamageTag(
        f.set(buildingCountTag, totalBuildings), damagedBuildings);
  });
}

/**
 * Sets {@link damageTag} on `feature` to `damagedBuildings / totalBuildings`,
 * where `totalBuildings` comes from the feature's {@link buildingCountTag}.
 * Handles edge case of `totalBuildings` being 0.
 * @param {ee.Feature} feature
 * @param {ee.Number} damagedBuildings
 * @return {ee.Feature}
 */
function addDamageTag(feature, damagedBuildings) {
  const totalBuildings = feature.get(buildingCountTag);
  // If no buildings, this is probably spurious. Don't give any damage. We
  // don't expect totalBuildings to be 0 in production, but it's bitten us
  // when working with partial buildings datasets. If this starts showing up
  // in production, we may need to surface it to user somehow.
  return feature.set(
      damageTag,
      ee.Algorithms.If(
          totalBuildings, ee.Number(damagedBuildings).divide(totalBuildings),
          0));
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
 * feature with SNAP data (including percentage).
 * @param {ee.Feature} feature
 * @param {string} snapKey
 * @param {string} totalKey
 * @return {ee.Feature}
 */
function combineWithSnap(feature, snapKey, totalKey) {
  const snapFeature = ee.Feature(feature.get('primary'));
  const snapPop = convertToNumber(snapFeature.get(snapKey));
  const totalPop = convertToNumber(ee.Number.parse(snapFeature.get(totalKey)));
  const badData = null;
  const snapPercentage = ee.Algorithms.If(
      totalPop,
      ee.Algorithms.If(
          ee.Algorithms.IsEqual(snapPop, null), badData,
          ee.Number(snapPop).long().divide(ee.Number(totalPop).long())),
      badData);
  return ee.Feature(
      ee.Feature(feature.get('secondary')).geometry(), ee.Dictionary([
        geoidTag,
        snapFeature.get(censusGeoidKey),
        blockGroupTag,
        snapFeature.get(censusBlockGroupKey),
        snapPopTag,
        snapPop,
        totalPopTag,
        totalPop,
        snapPercentageTag,
        snapPercentage,
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
 * Converts value of `property` in every {@link ee.Feature} into an
 * {@link ee.String}. If `newProperty` is given, also effectively renames
 * `property` to `newProperty`.
 * @param {ee.FeatureCollection} featureCollection
 * @param {string} property
 * @param {string} newProperty Defaults to `property`
 * @return {ee.FeatureCollection}
 */
function stringifyCollection(
    featureCollection, property, newProperty = property) {
  return featureCollection.map((f) => {
    const result = f.set(newProperty, ee.String(f.get(property)));
    if (newProperty === property) {
      return result;
    }
    return result.set(property, null);
  });
}

/**
 * For each {@link ee.Feature}, sets `newProperty` to the value of `property`
 * for that feature, and sets `property` to null, effectively removing its value
 * from every feature.
 * @param {ee.FeatureCollection} featureCollection
 * @param {string} property old name
 * @param {string} newProperty new name
 * @return {ee.FeatureCollection}
 */
function renameProperty(featureCollection, property, newProperty) {
  if (property === newProperty) {
    // Be gentle if two properties are the same.
    return featureCollection;
  }
  return featureCollection.map(
      (f) => f.set(newProperty, f.get(property)).set(property, null));
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
 * Performs operation of processing inputs and creating output asset for a
 * disaster whose data is state-based (available on a per-state basis, coming
 * from the Census).
 * @param {Object} disasterData Data for current disaster coming from Firestore
 * @param {Function} setMapBoundsInfoFunction Function to be called when map
 *     bounds-related operations are complete. First called with a message about
 *     the task, then called with the results
 * @return {?Promise<ee.batch.ExportTask>} Promise for task of asset write.
 */
function createScoreAssetForStateBasedDisaster(
    disasterData, setMapBoundsInfoFunction = setMapBoundsInfo) {
  setStatus('');
  const states = disasterData['states'];
  const assetData = disasterData['asset_data'];
  const blockGroupPaths = assetData['block_group_asset_paths'];
  const snapData = assetData['snap_data'];
  const snapPaths = snapData['paths'];
  const snapKey = snapData['snap_key'];
  const totalKey = snapData['total_key'];
  const sviPaths = assetData['svi_asset_paths'];
  const sviKey = assetData['svi_key'];
  const incomePaths = assetData['income_asset_paths'];
  const incomeKey = assetData['income_key'];
  // If we switch to CrowdAI data, this will change.
  const buildingPaths = assetData['building_asset_paths'];
  const {damage, damageEnvelope} =
      calculateDamage(assetData, setMapBoundsInfoFunction);
  let allStatesProcessing = ee.FeatureCollection([]);
  for (const state of states) {
    const snapPath = snapPaths[state];
    const sviPath = sviPaths[state];
    const incomePath = incomePaths[state];
    const buildingPath = buildingPaths[state];
    const blockGroupPath = blockGroupPaths[state];

    const stateGroups =
        ee.FeatureCollection(blockGroupPath).filterBounds(damageEnvelope);

    let processing =
        stringifyCollection(ee.FeatureCollection(snapPath), censusGeoidKey);

    // Join snap stats to block group geometries.
    processing =
        innerJoin(processing, stateGroups, censusGeoidKey, tigerGeoidKey);
    processing = processing.map((f) => combineWithSnap(f, snapKey, totalKey));
    if (incomePath) {
      // Join with income.
      processing = innerJoin(processing, incomePath, geoidTag, censusGeoidKey);
      processing =
          processing.map((f) => combineWithAsset(f, incomeTag, incomeKey));
    }
    if (sviPath) {
      // Join with SVI (data is at the tract level).
      processing = processing.map(addTractInfo);

      processing = innerJoin(processing, sviPath, tractTag, cdcGeoidKey);
      // Remove tract tag from final feature.
      processing = processing.map(
          (f) => combineWithAsset(f, sviTag, sviKey).set(tractTag, null));
    }

    if (buildingPath) {
      // Get building count by block group.
      const buildingsHisto =
          computeBuildingsHisto(buildingPath, stateGroups, geoidTag);
      processing = combineWithBuildings(processing, buildingsHisto);
    }

    if (damage) {
      // TODO(janakr): Assumes that damage asset does not include undamaged
      //  buildings. Should probably offer option to filter.
      processing = combineWithDamage(processing, damage);
    }

    allStatesProcessing = allStatesProcessing.merge(processing);
  }

  return backUpAssetAndStartTask(allStatesProcessing);
}

/**
 * Performs operation of processing inputs and creating output asset for a
 * disaster whose data is fairly flexible, with few assumptions. We expect:
 * 1. A poverty asset;
 * 2. An optional geography asset, which gives geographies to the districts in
 *    the poverty asset. If it is absent, the poverty asset already has
 *    geometries;
 * 3. An optional buildings asset;
 *      - If it has a "geoid" key, it is a table of building count per district;
 *      - If it does not, it is an {@link ee.FeatureCollection} of polygons
 *        corresponding to buildings, and a count is computed of polygons per
 *        district;
 *      - If it is absent, and `useDamageForBuildings` is false, the poverty
 *        asset already has a building count. If `useDamageForBuildings` is
 *        true, see below;
 * 4. An optional damage asset;
 *      - If `damageLevelsKey` is present, then undamaged buildings (indicated
 *        by `noDamageValue`) are filtered out of the damage asset when counting
 *        damage points in a district;
 *      - If `useDamageForBuildings` is true, then `damageLevelsKey` must be
 *        present, and the total number of "damage" points in a district
 *        (including undamaged ones) is used as the total building count.
 *
 * @param {Object} disasterData Data for current disaster coming from Firestore
 * @param {Function} setMapBoundsInfoFunction Function to be called when map
 *     bounds-related operations are complete. First called with a message about
 *     the task, then called with the results
 * @return {?Promise<ee.batch.ExportTask>} Promise for task of asset write.
 */
function createScoreAssetForFlexibleDisaster(
    disasterData, setMapBoundsInfoFunction = setMapBoundsInfo) {
  setStatus('');
  const assetData = disasterData['asset_data'];
  const {damage, damageEnvelope} =
      calculateDamage(assetData, setMapBoundsInfoFunction);
  const {flexibleData} = assetData;
  let processing = ee.FeatureCollection(flexibleData.povertyPath);
  const {povertyGeoid, geographyPath, buildingPath, buildingKey} = flexibleData;
  const {useDamageForBuildings} = assetData;
  // First thing we do is add geographies if necessary and restrict to the
  // damage envelope, so that we can minimize downstream work.
  if (geographyPath) {
    const {geographyGeoid} = flexibleData;
    const geographyCollection = stringifyCollection(
        ee.FeatureCollection(geographyPath).filterBounds(damageEnvelope),
        geographyGeoid);
    processing = stringifyCollection(processing, povertyGeoid, geoidTag);
    processing =
        innerJoin(processing, geographyCollection, geoidTag, geographyGeoid);
    processing = processing.map(
        (f) => ee.Feature(
            ee.Feature(f.get('secondary')).geometry(),
            ee.Feature(f.get('primary')).toDictionary()));
  } else {
    processing = processing.filterBounds(damageEnvelope);
    processing = renameProperty(processing, povertyGeoid, geoidTag);
  }
  // Rename description property so it can be recognized as special.
  processing = renameProperty(
      processing, flexibleData.districtDescriptionKey, blockGroupTag);

  if (buildingPath) {
    const {buildingGeoid} = flexibleData;
    const buildingCollection = ee.FeatureCollection(buildingPath);
    if (buildingGeoid) {
      // TODO(janakr): Should this be a more expansive join? If some district is
      //  missing building counts, this will exclude it completely.
      processing = innerJoin(
          processing, stringifyCollection(buildingCollection, buildingGeoid),
          geoidTag, buildingGeoid);
      processing = processing.map(
          (f) => combineWithAsset(f, buildingCountTag, buildingKey));
    } else {
      const buildingsHisto =
          computeBuildingsHisto(buildingCollection, processing);
      processing = combineWithBuildings(processing, buildingsHisto);
    }
  } else if (!useDamageForBuildings) {
    processing = renameProperty(processing, buildingKey, buildingCountTag);
  }
  if (damage) {
    const {damageLevelsKey, noDamageValue} = assetData;
    if (useDamageForBuildings) {
      processing = combineWithDamageAndUseForBuildings(
          processing, damage, damageLevelsKey, noDamageValue);
    } else {
      processing =
          combineWithDamage(processing, damage, damageLevelsKey, noDamageValue);
    }
  }
  return backUpAssetAndStartTask(processing);
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
 * @param {ee.FeatureCollection} geographies Collection with districts
 * @return {ee.Dictionary} Number of buildings per district
 */
function computeBuildingsHisto(buildingPath, geographies) {
  const buildings = ee.FeatureCollection(buildingPath);
  const field = 'fieldToSaveDistrictUnder';
  const withBlockGroup =
      ee.Join.saveFirst(field)
          .apply(
              buildings, geographies,
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
