import {disasterDocumentReference} from '../firestore_document.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {storeCenter as default};

/**
 * Adds the lat and lng of a feature's centroid as properties.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function withGeo(feature) {
  const centroid = feature.centroid().geometry().coordinates();
  return feature.set('lng', centroid.get(0), 'lat', centroid.get(1));
}

/**
 * Stores an approximate bounds around a given feature collection.
 *
 * @param {ee.FeatureCollection} features the featureCollection around which you
 * want to orient the map
 * @param {Promise} firebaseAuthPromise
 * @return {Promise<Array<number>>} Promise that completes with array of bounds
 * after Firestore write is complete.
 */
function storeCenter(features, firebaseAuthPromise) {
  const damageWithCoords = ee.FeatureCollection(features.map(withGeo));
  // This is assuming we're not crossing the international date line...
  const outerBounds = ee.List([
    damageWithCoords.aggregate_min('lat'),
    damageWithCoords.aggregate_min('lng'),
    damageWithCoords.aggregate_max('lat'),
    damageWithCoords.aggregate_max('lng'),
  ]);
  return Promise
      .all([firebaseAuthPromise, convertEeObjectToPromise(outerBounds)])
      .then((results) => saveBounds(results[1]));
}

/**
 * Writes the calculated bounds to firestore.
 * @param {Array<number>} bounds
 * @return {Promise<Array{number}>} Promise that completes with array of bounds
 * after Firestore write is complete.
 */
function saveBounds(bounds) {
  const docData = {
    'map-bounds': {
      sw: new firebase.firestore.GeoPoint(bounds[0], bounds[1]),
      ne: new firebase.firestore.GeoPoint(bounds[2], bounds[3]),
    }
  };
  return disasterDocumentReference()
      .set(docData, {merge: true})
      .then(() => bounds);
}
