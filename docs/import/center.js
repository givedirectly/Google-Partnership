import {disasterDocumentReference} from '../firestore_document.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {saveBounds, storeCenter};

/**
 * Stores an approximate bounds around a given feature collection.
 *
 * @param {ee.FeatureCollection} features the featureCollection around which you
 * want to orient the map
 * @return {Promise<Array<number>>} Promise that completes with array of bounds
 * after Firestore write is complete.
 */
function storeCenter(features) {
  return convertEeObjectToPromise(features.geometry().bounds())
      .then(saveBounds);
}

/**
 * Writes the calculated bounds to firestore.
 * @param {GeoJson.Rectangle} bounds
 * @return {Promise<Array<number>>} Promise that completes with array of bounds
 * after Firestore write is complete.
 */
function saveBounds(bounds) {
  const coordinates = bounds.coordinates[0];
  const sw = coordinates[0];
  const ne = coordinates[2];
  const docData = {
    'map-bounds': {
      sw: makeGeoPointFromGeoJsonPoint(sw),
      ne: makeGeoPointFromGeoJsonPoint(ne),
    },
  };
  return disasterDocumentReference()
      .set(docData, {merge: true})
      .then(() => [sw, ne]);
}

/**
 * Converts LatLng into Firestore GeoPoint.
 * @param {Array<number>} point GeoJson point.
 * @return {firebase.firestore.GeoPoint}
 */
function makeGeoPointFromGeoJsonPoint(point) {
  return new firebase.firestore.GeoPoint(point[1], point[0]);
}
