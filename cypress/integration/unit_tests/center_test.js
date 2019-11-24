import {assertFirestoreMapBounds, expectLatLngBoundsWithin} from '../../support/firestore_map_bounds';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader';
import {storeCenter} from "../../../docs/import/center";

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
      sw: {lat: 2.5, lng: 1.5},
      ne: {lat: 60, lng: 50},
    };
    cy.wrap(storeCenter(damageCollection))
        .then(makeLatLngBoundsFromGeoJsonPoints)
        .then((bounds) => expectLatLngBoundsWithin(bounds, expectedLatLngBounds));
    assertFirestoreMapBounds(expectedLatLngBounds);
  });
});

function makeLatLngBoundsFromGeoJsonPoints(bounds) {
  return {sw: makeLatLngFromGeoJsonPoint(bounds[0]), ne: makeLatLngFromGeoJsonPoint(bounds[1])};
}

function makeLatLngFromGeoJsonPoint(point) {
  return {lng: point[0], lat: point[1]};
}