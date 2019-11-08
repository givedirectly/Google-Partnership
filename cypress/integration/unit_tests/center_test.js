import {readDisasterDocument} from '../../../docs/firestore_document';
import storeCenter from '../../../docs/import/center';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader';

describe('Unit test for center.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase');
  addFirebaseHooks();
  before(
      () =>
          cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken)));

  it('calculates bounds', () => {
    const damageCollection = ee.FeatureCollection([
      ee.Feature(ee.Geometry.Point([1.5, 40])),
      ee.Feature(ee.Geometry.Point([20, 2.5])),
      ee.Feature(ee.Geometry.Point([50, 6])),
      ee.Feature(ee.Geometry.Point([5, 60])),
    ]);
    // Firebase (and human convention) puts latitude first.
    const expectedBounds = [2.5, 1.5, 60, 50];
    cy.wrap(storeCenter(damageCollection, Promise.resolve()))
        // Because of floating-point errors, can't assert exactly.
        .then((bounds) => {
          // Expect that result returned from function is correct.
          expectArrayWithin(bounds, expectedBounds);
          return readDisasterDocument();
        })
        .then((doc) => {
          // Expect that result retrieved from Firestore is correct.
          const mapBounds = doc.data()['map-bounds'];
          expectArrayWithin(
              [
                mapBounds.sw.latitude,
                mapBounds.sw.longitude,
                mapBounds.ne.latitude,
                mapBounds.ne.longitude,
              ],
              expectedBounds);
        });
  });
});

/**
 * Utility function to compare two numerical arrays within a tolerance.
 * @param {Array<number>} actualArray
 * @param {Array<number>} expectedArray
 */
function expectArrayWithin(actualArray, expectedArray) {
  expect(actualArray).to.have.length(expectedArray.length);
  for (let i = 0; i < actualArray.length; i++) {
    expectWithin(actualArray[i], expectedArray[i]);
  }
}

/**
 * Utility function to compare two numbers within a tolerance of 0.1.
 * @param {number} actualNumber
 * @param {number} expectedNumber
 */
function expectWithin(actualNumber, expectedNumber) {
  expect(actualNumber).to.be.within(expectedNumber - 0.1, expectedNumber + 0.1);
}
