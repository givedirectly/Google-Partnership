import createError from '../create_error.js';
import {convertEeObjectToPromise} from '../map_util.js';
import {getDisaster, getResources} from '../resources.js';

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
 */
function storeCenter(features, firebaseAuthPromise) {
  const damageWithCoords = ee.FeatureCollection(features.map(withGeo));
  // This is assuming we're not crossing the international date line...
  const outerBounds = ee.List([
    damageWithCoords.aggregate_max('lat'),
    damageWithCoords.aggregate_max('lng'),
    damageWithCoords.aggregate_min('lat'),
    damageWithCoords.aggregate_min('lng'),
  ]);
  Promise.all([firebaseAuthPromise, convertEeObjectToPromise(outerBounds)])
      .then((results) => saveBounds(results[1]))
      .catch(createError('error finding bounds of map'));
}

/**
 * Writes the calculated bounds to firestore.
 * @param {array<number>} bounds
 */
function saveBounds(bounds) {
  const docData = {
    ne: new firebase.firestore.GeoPoint(bounds[0], bounds[1]),
    sw: new firebase.firestore.GeoPoint(bounds[2], bounds[3]),
  };
  const disaster = getDisaster();
  firebase.firestore()
      .collection('disaster-metadata')
      .doc(getResources().year)
      .collection(disaster)
      .doc('map-bounds')
      .set(docData)
      .catch(
          createError('error saving bounds for ' + disaster + ': ' + docData));
}
