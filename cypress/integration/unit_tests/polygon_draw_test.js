import {getFirestoreRoot} from '../../../docs/authenticate';
import * as loading from '../../../docs/loading';
import {processUserRegions, StoredShapeData} from '../../../docs/polygon_draw';
import * as resourceGetter from '../../../docs/resources';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

// First coordinate is x, or longitude, second is y, latitude.
const polyCoords = [[1, 1], [1, 2], [13, 2], [13, 1], [1, 1]];

const polyLatLng = polyCoords.map((pair) => makeLatLng(pair[1], pair[0]));
const firebaseCollection = {};
const calculatedData = {
  damage: 1,
  snapFraction: 0.6,
};

describe('Unit test for ShapeData', () => {
  loadScriptsBeforeForUnitTests('ee', 'maps', 'firebase');
  let polygonGeometry;
  before(() => {
    polygonGeometry = polyLatLng.map(
        (latlng) =>
            new firebase.firestore.GeoPoint(latlng.lat(), latlng.lng()));
    // Stub out loading update attempts: they pollute console with errors.
    loading.addLoadingElement = () => {};
    loading.loadingElementFinished = () => {};
  });
  beforeEach(() => {
    // Polygon intersects feature1 and feature2, not feature3.
    const feature1 = ee.Feature(
        ee.Geometry.Polygon(0, 0, 0, 10, 10, 10, 10, 0),
        {'SNAP HOUSEHOLDS': 1, 'TOTAL HOUSEHOLDS': 2});
    const feature2 = ee.Feature(
        ee.Geometry.Polygon(10, 0, 10, 10, 20, 10, 20, 0),
        {'SNAP HOUSEHOLDS': 3, 'TOTAL HOUSEHOLDS': 4});
    const feature3 = ee.Feature(
        ee.Geometry.Polygon(20, 0, 20, 10, 30, 10, 30, 0),
        {'SNAP HOUSEHOLDS': 1000, 'TOTAL HOUSEHOLDS': 1000});
    const featureCollection =
        ee.FeatureCollection([feature1, feature2, feature3]);
    // Polygon contains only first damage point.
    const damageCollection = ee.FeatureCollection([
      ee.Feature(ee.Geometry.Point([1.5, 1.5])),
      ee.Feature(ee.Geometry.Point([200, 200])),
    ]);
    // Use our custom EarthEngine FeatureCollections.
    cy.stub(resourceGetter, 'getResources').returns({
      damage: damageCollection,
      getCombinedAsset: () => featureCollection,
    });

    // Set up appropriate Firestore mocks.
    cy.stub(getFirestoreRoot(), 'collection')
        .withArgs('usershapes')
        .returns(firebaseCollection);
    for (const prop in firebaseCollection) {
      if (firebaseCollection.hasOwnProperty(prop)) {
        delete firebaseCollection[prop];
      }
    }
    // Make sure .get() succeeds.
    firebaseCollection.get = () => [];
    // Make sure userShapes is set in the code.
    return cy.wrap(processUserRegions(null, Promise.resolve(null)));
  });

  it('Add shape', () => {
    const popup = new StubPopup();
    const underTest = new StoredShapeData(null, null, null, popup);
    const records = [];
    firebaseCollection.add = recordRecord(records, {id: 'new_id'});
    popup.notes = 'my notes';
    cy.wrap(underTest.update()).then(() => {
      expect(records).to.eql([{
        calculatedData: calculatedData,
        geometry: polygonGeometry,
        notes: 'my notes',
      }]);
      expect(underTest.id).to.eql('new_id');
      expect(StoredShapeData.pendingWriteCount).to.eql(0);
    });
  });

  it('Update shape', () => {
    const popup = new StubPopup();
    popup.setCalculatedData(calculatedData);
    const underTest =
        new StoredShapeData('my_id', 'my notes', polygonGeometry, popup);
    const records = [];
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {set: recordRecord(records, null)};
    };
    popup.notes = 'new notes';
    cy.wrap(underTest.update()).then(() => {
      expect(ids).to.eql(['my_id']);
      expect(records).to.eql([{
        calculatedData: calculatedData,
        geometry: polygonGeometry,
        notes: 'new notes',
      }]);
      expect(underTest.id).to.eql('my_id');
      expect(StoredShapeData.pendingWriteCount).to.eql(0);
    });
  });

  it('Delete shape', () => {
    const popup = new StubPopup();
    popup.setCalculatedData(calculatedData);
    const underTest =
        new StoredShapeData('my_id', 'my notes', polygonGeometry, popup);
    popup.mapFeature.getMap = () => null;
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {
        delete: () => Promise.resolve(),
      };
    };
    cy.wrap(underTest.update()).then(() => {
      expect(ids).to.eql(['my_id']);
      expect(underTest.id).to.eql('my_id');
      expect(StoredShapeData.pendingWriteCount).to.eql(0);
    });
  });

  it('Update while update pending', () => {
    const popup = new StubPopup();
    popup.setCalculatedData(calculatedData);
    const underTest =
        new StoredShapeData('my_id', 'my notes', polygonGeometry, popup);
    const records = [];
    const ids = [];
    const setThatTriggersNewUpdate = {
      set: (record) => {
        popup.notes = 'racing notes';
        expect(underTest.update()).to.be.null;
        expect(popup.calculatedData).to.eql(calculatedData);
        expect(underTest.state).to.eql(StoredShapeData.State.QUEUED_WRITE);
        records.push(record);
        expect(StoredShapeData.pendingWriteCount).to.eql(1);
        // Put back usual set for next run.
        setThatTriggersNewUpdate.set = recordRecord(records, null);
        return Promise.resolve(null);
      },
    };
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return setThatTriggersNewUpdate;
    };
    popup.notes = 'new notes';
    cy.wrap(underTest.update()).then(() => {
      expect(ids).to.eql(['my_id', 'my_id']);
      expect(records).to.have.length(2);
      expect(records).to.eql([
        {
          calculatedData: calculatedData,
          geometry: polygonGeometry,
          notes: 'new notes',
        },
        {
          calculatedData: calculatedData,
          geometry: polygonGeometry,
          notes: 'racing notes',
        },
      ]);
      expect(underTest.id).to.eql('my_id');
      expect(StoredShapeData.pendingWriteCount).to.eql(0);
    });
  });

  it('Skips update if nothing changed', () => {
    const popup = new StubPopup();
    popup.notes = 'my notes';
    popup.setCalculatedData(calculatedData);
    popup.setPendingCalculation = () => {
      throw new Error('Unexpected calculation');
    };
    popup.setCalculatedData = () => {
      throw new Error('Unexpected calculation');
    };
    const underTest =
        new StoredShapeData('my_id', 'my notes', polygonGeometry, popup);
    firebaseCollection.doc = () => {
      throw new Error('Unexpected Firestore call');
    };
    cy.wrap(underTest.update());
    // Nothing crashed.
  });

  it('Skips recalculation if geometry unchanged', () => {
    const popup = new StubPopup();
    popup.setCalculatedData(calculatedData);
    popup.setPendingCalculation = () => {
      throw new Error('Unexpected calculation');
    };
    popup.setCalculatedData = () => {
      throw new Error('Unexpected calculation');
    };
    const ids = [];
    const records = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {set: recordRecord(records, null)};
    };
    const underTest =
        new StoredShapeData('my_id', 'my notes', polygonGeometry, popup);
    popup.notes = 'new notes';
    cy.wrap(underTest.update()).then(() => {
      expect(ids).to.eql(['my_id']);
      expect(records).to.eql([{
        calculatedData: calculatedData,
        geometry: polygonGeometry,
        notes: 'new notes',
      }]);
      expect(underTest.id).to.eql('my_id');
      expect(StoredShapeData.pendingWriteCount).to.eql(0);
    });
  });
});

/**
 * Returns a function that will record a given record to records and then
 * return a FakePromise that will pass retval to its function argument. It
 * will also assert that there is 1 pending write.
 *
 * @param {Array} records
 * @param {Object} retval
 * @return {function(*=): FakePromise}
 */
function recordRecord(records, retval) {
  return (record) => {
    expect(StoredShapeData.pendingWriteCount).to.eql(1);
    records.push(record);
    return Promise.resolve(retval);
  };
}

/**
 * Make an approximation of a google.maps.Polygon with a single-point path and
 * a "true" getMap return value.
 *
 * @return {Object} fake google.maps.Polygon.
 */
function makeMockPolygon() {
  const mockPolygon = {};
  mockPolygon.getMap = () => true;
  mockPolygon.getPath = () =>
      [makeLatLng(1, 1), makeLatLng(2, 1), makeLatLng(2, 13), makeLatLng(1, 13),
       makeLatLng(1, 1)];
  return mockPolygon;
}

/**
 * Makes a google.maps.LatLng object.
 * @param {number} lat
 * @param {number} lng
 * @return {google.maps.LatLng}
 */
function makeLatLng(lat, lng) {
  return new google.maps.google.maps.LatLng({latitude: lat, longitude: lng});
}

/** Stub of the Popup class. */
class StubPopup {
  /** @constructor */
  constructor() {
    this.mapFeature = makeMockPolygon();
  }

  /** Does nothing. */
  setPendingCalculation() {}

  /**
   * Sets calculatedData property.
   * @param {Object} calculatedData
   */
  setCalculatedData(calculatedData) {
    this.calculatedData = calculatedData;
  }
}
