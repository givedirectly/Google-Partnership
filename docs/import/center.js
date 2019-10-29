import createError from '../create_error.js';
import {convertEeObjectToPromise} from '../map_util.js';
import {getDisaster, getResources} from '../resources.js';
import TaskAccumulator from './task_accumulator.js';

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

let bounds = null;

/**
 * Stores an approximate bounds around a given feature collection.
 *
 * @param {ee.FeatureCollection} features the featureCollection around which you
 * want to orient the map
 * @param {Promise} firebaseAuthPromise
 */
function storeCenter(features, firebaseAuthPromise) {
  // We need both firebase to authenticate and the ee.List to evaluate.
  const taskAccumulator = new TaskAccumulator(2, saveBounds);

  firebaseAuthPromise.then(() => taskAccumulator.taskCompleted());

  const damageWithCoords = ee.FeatureCollection(features.map(withGeo));
  // This is assuming we're not crossing the international date line...
  const outerBounds = ee.List([
    damageWithCoords.aggregate_max('lng'),
    damageWithCoords.aggregate_min('lat'),
    damageWithCoords.aggregate_min('lng'),
    damageWithCoords.aggregate_max('lat'),
  ]);
  convertEeObjectToPromise(outerBounds).then((evaluatedBounds) => {
    bounds = evaluatedBounds;
    taskAccumulator.taskCompleted();
  });
}

/** Writes the calculated bounds to firestore. */
function saveBounds() {
  const docData = {
    ne: new firebase.firestore.GeoPoint(bounds[3], bounds[0]),
    sw: new firebase.firestore.GeoPoint(bounds[1], bounds[2]),
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
