import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {convertEeObjectToPromise} from '../map_util.js';
import {disaster, getResources} from '../resources.js';
export {storeCenter as default};

/**
 * Add the lat and lng of a feature's centroid as properties.
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
 */
function storeCenter(features) {
  const authenticator =
      new Authenticator((token) => authenticateToFirebase(token).then(() => {
        taskCompleted();
      }));
  authenticator.start();

  const damageWithCoords = ee.FeatureCollection(features.map(withGeo));
  // This is assuming we're not crossing the international date line...
  const outerBounds = ee.List([
    damageWithCoords.aggregate_max('lng'),
    damageWithCoords.aggregate_min('lat'),
    damageWithCoords.aggregate_min('lng'), damageWithCoords.aggregate_max('lat'),
  ]);
  convertEeObjectToPromise(outerBounds).then((evaluatedBounds) => {
    bounds = evaluatedBounds;
    taskCompleted();
  });
}

// We need both firebase to authenticate and the the ee.List to evaluate.
let tasks = 2;

/**
 * Records a task being completed and calls saveBounds if everything is ready.
 */
function taskCompleted() {
  if (--tasks === 0) {
    saveBounds();
  }
}

/** Writes the calculated bounds to firestore. */
function saveBounds() {
  const docData = {
    ne: new firebase.firestore.GeoPoint(bounds[3], bounds[0]),
    sw: new firebase.firestore.GeoPoint(bounds[1], bounds[2]),
  };
  firebase.firestore()
      .collection('disaster-metadata')
      .doc(getResources().year)
      .collection(disaster)
      .doc('map-bounds')
      .set(docData)
      .then(() => {
        console.log('wrote ' + disaster + ' map center to firestore');
      });
}
