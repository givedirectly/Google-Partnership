import {computeAndSaveBounds} from '../../../docs/import/center';
import {assertFirestoreMapBounds, expectLatLngBoundsWithin} from '../../support/firestore_map_bounds';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

describe('Unit test for center.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase');
  it('calculates bounds', () => {
    const damageCollection = ee.FeatureCollection([
      ee.Feature(ee.Geometry.Point([1.5, 40])),
      ee.Feature(ee.Geometry.Point([20, 2.5])),
      ee.Feature(ee.Geometry.Point([50, 6])),
      ee.Feature(ee.Geometry.Point([5, 60])),
    ]);
    const expectedLatLngBounds = {
      sw: {lat: 2.5, lng: 1.5},
      ne: {lat: 60, lng: 50},
    };
    cy.wrap(computeAndSaveBounds(damageCollection.geometry()))
        .then(makeLatLngBoundsFromGeoJsonPoints)
        .then(
            (bounds) => expectLatLngBoundsWithin(bounds, expectedLatLngBounds));
    assertFirestoreMapBounds(expectedLatLngBounds);
  });
});

/**
 * Makes a LatLngBounds-style point from two GeoJson points.
 * @param {Array<Array<number>>} bounds
 * @return {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}}
 */
function makeLatLngBoundsFromGeoJsonPoints(bounds) {
  return {
    sw: makeLatLngFromGeoJsonPoint(bounds[0]),
    ne: makeLatLngFromGeoJsonPoint(bounds[1]),
  };
}

/**
 * Makes a LatLng-style point from a GeoJson point (just an array).
 * @param {Array<number>} point
 * @return {{lng: number, lat: number}}
 */
function makeLatLngFromGeoJsonPoint(point) {
  return {lng: point[0], lat: point[1]};
}
