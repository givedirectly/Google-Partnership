import {authenticateToFirebase, Authenticator} from '../authenticate';
import {convertEeObjectToPromise} from '../layer_util';
import {findBounds} from '../map_util.js';

export {storeCenter as default};

let promises = 2;
let damage = null;

/**
 *
 * @param {ee.FeatureCollection} damage
 */
function storeCenter(damage) {
  const authenticator = new Authenticator(
      (token) => authenticateToFirebase(token).then(() => promisesCompleted()));
  authenticator.start();
  convertEeObjectToPromise(damage).then((featureCollection) => {
    damage = featureCollection;
    promisesCompleted();
  })
}

function promisesCompleted() {
  if (--promses === 0) {
    calculateCenter();
  }
}

function calculateCenter() {
  const bounds = findBounds(damage);
  const docData = {
    ne: latLngToGeoPoint(bounds.getNorthEast()),
    sw: latLngToGeoPoint(bounds.getSouthWest()),
  };
  firebase.firestore()
      .collection('disaster-metadata')
      .doc('2018')
      .collection('michael')
      .doc('map-center')
      .set(docData)
      .then(() => {
        console.log('wrote it!');
      });
}