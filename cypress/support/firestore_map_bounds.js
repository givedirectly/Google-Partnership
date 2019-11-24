import {readDisasterDocument} from '../../docs/firestore_document';

export {assertFirestoreMapBounds, expectWithin};

/**
 * Utility for center_test and import_data_test to assert on Firestore map
 * bounds.
 * @param {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}} expectedLatLngBounds
 */
function assertFirestoreMapBounds(expectedLatLngBounds) {
  cy.wrap(readDisasterDocument()).then((doc) => {
    // Expect that result retrieved from Firestore is correct.
    const mapBounds = doc.data()['map-bounds'];
    expectLatLngBoundsWithin(
        {
          sw: makeLatLngFromGeoPoint(mapBounds.sw),
          ne: makeLatLngFromGeoPoint(mapBounds.ne),
        },
        expectedLatLngBounds);
  });
}


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

/**
 * Converts a {@link firebase.firestore.GeoPoint} into a LatLng.
 * @param {firebase.firestore.GeoPoint} geopoint
 * @returns {{lng: number, lat: number}}
 */
function makeLatLngFromGeoPoint(geopoint) {
  return {lat: geopoint.latitude, lng: geopoint.longitude};
}
