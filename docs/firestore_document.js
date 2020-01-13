import {getTestValue, inProduction} from './in_test_util.js';
import {getDisaster} from './resources.js';

export {
  disasterCollectionReference,
  disasterDocumentReference,
  getDisasters,
  getDisastersData,
  getFirestoreRoot,
  getUserFeatures,
  readDisasterDocument,
  userFeatures,
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
 * Object with all Firestore metadata for a user feature
 * @typedef {Object} ShapeDocument
 */

/**
 * Object with all Firestore metadata for the current disaster (everything under
 * `disaster-metadata/2017-harvey`, for instance).
 * @typedef {Object} DisasterDocument
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

/**
 * @return {firebase.firestore.CollectionReference} all usershapes collection
 */
function userFeatures() {
  return getFirestoreRoot().collection('usershapes');
}

/** @return {Promise<Map<string, ShapeDocument>>} all user shapes */
function getUserFeatures() {
  return userFeatures().get().then(convertQuerySnapshotToMap);
}

/** @return {Promise<Map<string, DisasterDocument>>} data for all disasters */
function getDisastersData() {
  return getDisasters().then(convertQuerySnapshotToMap);
}

/**
 * Funciton that converts the result of a firestore collection {@code get} into
 * a map of doc ids -> data.
 * @param {Promise<firebase.firestore.QuerySnapshot>} querySnapshot
 * @return {Map<string, object>}
 */
function convertQuerySnapshotToMap(querySnapshot) {
  const data = new Map();
  querySnapshot.forEach((doc) => data.set(doc.id, doc.data()));
  return data;
}
