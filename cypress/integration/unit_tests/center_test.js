import {readDisasterDocument} from '../../../docs/firestore_document';
import {getDamageBounds, getLatLngBoundsPromiseFromEeRectangle, saveBounds} from '../../../docs/import/center.js';
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
    const expectedLatLngBounds = {
      sw: {lat: 2.49, lng: 1.49},
      ne: {lat: 60.01, lng: 50.01},
    };
    cy.wrap(getLatLngBoundsPromiseFromEeRectangle(
                getDamageBounds(damageCollection)))
        // Because of floating-point errors, can't assert exactly.
        .then((bounds) => {
          // Expect that result returned from function is correct.
          expectLatLngBoundsWithin(bounds, expectedLatLngBounds);
          return saveBounds(bounds);
        })
        .then(() => readDisasterDocument())
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
              // Firebase (and human convention) puts latitude first.
              [
                expectedLatLngBounds.sw.lat, expectedLatLngBounds.sw.lng,
                expectedLatLngBounds.ne.lat, expectedLatLngBounds.ne.lng,
              ]);
        });
  });
});

/**
 * Asserts that actualBounds is equal to expectedBounds, up to tolerance.
 * @param {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}}
 *     actualBounds
 * @param {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}}
 *     expectedBounds
 */
function expectLatLngBoundsWithin(actualBounds, expectedBounds) {
  expectLatLngWithin(actualBounds.sw, expectedBounds.sw);
  expectLatLngWithin(actualBounds.ne, expectedBounds.ne);
}

/**
 * Asserts that actual is equal to expected, up to tolerance.
 * @param {{lng: number, lat: number}} actual
 * @param {{lng: number, lat: number}} expected
 */
function expectLatLngWithin(actual, expected) {
  expectWithin(actual.lat, expected.lat);
  expectWithin(actual.lng, expected.lng);
}

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

const floatingError = 0.000001;
/**
 * Utility function to compare two numbers within a tolerance of floatingError.
 * @param {number} actualNumber
 * @param {number} expectedNumber
 */
function expectWithin(actualNumber, expectedNumber) {
  expect(actualNumber)
      .to.be.within(
          expectedNumber - floatingError, expectedNumber + floatingError);
}
