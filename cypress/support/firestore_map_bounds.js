import {readDisasterDocument} from '../../docs/firestore_document';
import {cyQueue} from './commands.js';

export {assertFirestoreMapBounds, expectLatLngBoundsWithin};

/**
 * Utility for center_test and import_data_test to assert on Firestore map
 * bounds.
 * @param {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}}
 *     expectedLatLngBounds
 */
function assertFirestoreMapBounds(expectedLatLngBounds) {
  // Make sure we don't call readDisasterDocument until Cypress is ready.
  cyQueue(readDisasterDocument).then((doc) => {
    // Expect that result retrieved from Firestore is correct.
    const {mapBounds} = doc.data();
    expectLatLngBoundsWithin(
        {
          sw: makeLatLngFromGeoPoint(mapBounds.sw),
          ne: makeLatLngFromGeoPoint(mapBounds.ne),
        },
        expectedLatLngBounds);
  });
}


/**
 * Asserts that actualBounds is equal to expectedBounds, up to tolerance because
 * of floating-point errors and EarthEngine imprecision.
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
 * Utility function to compare two numbers within a tolerance. The tolerance is
 * proportional to the max of the numbers' magnitudes, because EarthEngine can
 * be a bit imprecise when computing bounds.
 * @param {number} actualNumber
 * @param {number} expectedNumber
 */
function expectWithin(actualNumber, expectedNumber) {
  const errorBase = Math.max(Math.abs(actualNumber), Math.abs(expectedNumber));
  // Experimentally found to work for current tests and EE precision.
  const maxError = .006 * errorBase;
  expect(actualNumber)
      .to.be.within(expectedNumber - maxError, expectedNumber + maxError);
}

/**
 * Converts a {@link firebase.firestore.GeoPoint} into a LatLng.
 * @param {firebase.firestore.GeoPoint} geopoint
 * @return {{lng: number, lat: number}}
 */
function makeLatLngFromGeoPoint(geopoint) {
  return {lat: geopoint.latitude, lng: geopoint.longitude};
}
