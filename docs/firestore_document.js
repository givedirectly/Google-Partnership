import {getTestValue, inProduction} from './in_test_util.js';
import {getDisaster} from './resources.js';

export {
  disasterCollectionReference,
  disasterDocumentReference,
  getDisasters,
  getDisastersData,
  getFirestoreRoot,
  readDisasterDocument,
};

/**
 * Returns the root of the Firestore database. Just firebase.firestore() in
 * production, but a subcollection in tests to avoid data collisions.
 * @return {firebase.firestore.Firestore|firebase.firestore.CollectionReference}
 */
function getFirestoreRoot() {
  return inProduction() ? firebase.firestore() :
                          firebase.firestore().doc('test/' + getTestValue());
}

/**
 * Returns the reference to the disaster metadata document, intended only for
 * writers.
 * @return {firebase.firestore.DocumentReference}
 */
function disasterDocumentReference() {
  return disasterCollectionReference().doc(getDisaster());
}

/**
 * Object with all Firestore metadata for the current disaster (everything under
 * `disaster-metadata/2017-harvey`, for instance).
 * @typedef {Object} DisasterDocument
 * @property {AssetData} assetData The asset data.
 */

/**
 * Fetches the document with all metadata for the current disaster. Should only
 * be called once to avoid excessive fetches.
 * @return {Promise<DisasterDocument>}
 */
function readDisasterDocument() {
  return disasterDocumentReference().get().then((doc) => doc.data());
}

/** @return {firebase.firestore.CollectionReference} all disasters collection */
function disasterCollectionReference() {
  return getFirestoreRoot().collection('disaster-metadata');
}

/** @return {Promise<firebase.firestore.QuerySnapshot>} listing of disasters */
function getDisasters() {
  return disasterCollectionReference().get();
}

/** @return {Promise<Map<string, DisasterDocument>>} data for all disasters */
function getDisastersData() {
  const disasterData = new Map();
  return getDisasters()
      .then(
          (querySnapshot) => querySnapshot.forEach(
              (doc) => disasterData.set(doc.id, doc.data())))
      .then(() => disasterData);
}
