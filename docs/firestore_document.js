import {getTestCookie, inProduction} from './in_test_util.js';
import {getDisaster, getResources} from './resources.js';

export {disasterDocumentReference, getFirestoreRoot, readDisasterDocument};

/**
 * Returns the root of the Firestore database. Just firebase.firestore() in
 * production, but a subcollection in tests to avoid data collisions.
 * @return {firebase.firestore.Firestore|firebase.firestore.CollectionReference}
 */
function getFirestoreRoot() {
  return inProduction() ? firebase.firestore() :
                          firebase.firestore().doc('test/' + getTestCookie());
}

/**
 * Returns the reference to the disaster metadata document, intended only for
 * writers.
 * @return {firebase.firestore.DocumentReference}
 */
function disasterDocumentReference() {
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(getDisaster());
}

/**
 * Fetches the document with all metadata for the current disaster. Should only
 * be called once to avoid excessive fetches.
 * @return {Promise<firebase.firestore.DocumentSnapshot>}
 */
function readDisasterDocument() {
  return disasterDocumentReference().get();
}
