import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {convertEeObjectToPromise} from '../map_util.js';
import {disaster, getResources} from '../resources.js';
export {storeCenter as default};

let promises = 2;
let bounds = null;

function withGeo(feature) {
  const centroid = feature.centroid().geometry().coordinates();
  return feature.set('lng', centroid.get(0), 'lat', centroid.get(1));
}

/**
 * Stores an approximate bounds around a given feature collection.
 *
 * @param {ee.FeatureCollection} features the featureCollection which you want
 * to orient the map around.
 */
function storeCenter(features) {
  const authenticator =
      new Authenticator((token) => authenticateToFirebase(token).then(() => {
        promisesCompleted();
      }));
  authenticator.start();

  const damageWithCoords = ee.FeatureCollection(damage.map(withGeo));
  // This is assuming we're not crossing the international date line...
  // so may not work with some tiny islands in the pacific.
  // list is [north-most, west-most, south-most, east-most]
  const outerBounds = ee.List([
    damageWithCoords.aggregate_max('lng'),
    damageWithCoords.aggregate_min('lat'),
    damageWithCoords.aggregate_min('lng'), damageWithCoords.aggregate_max('lat')
  ]);
  convertEeObjectToPromise(outerBounds).then((evaluatedBounds) => {
    bounds = evaluatedBounds;
    promisesCompleted();
  });
}

function promisesCompleted() {
  if (--promises === 0) {
    calculateCenter();
  }
}

function calculateCenter() {
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