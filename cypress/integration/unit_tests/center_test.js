import {getDamageBounds, getLatLngBoundsPromiseFromEeRectangle, saveBounds} from '../../../docs/import/center.js';
import {assertFirestoreMapBounds} from '../../support/firestore_map_bounds';
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
        .then((bounds) => {
          // Expect that result returned from function is correct.
          expectLatLngBoundsWithin(bounds, expectedLatLngBounds);
          return saveBounds(bounds);
        });
    assertFirestoreMapBounds(expectedLatLngBounds);
  });
});
