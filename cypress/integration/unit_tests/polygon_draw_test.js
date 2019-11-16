import {getFirestoreRoot} from '../../../docs/firestore_document';
import * as loading from '../../../docs/loading';
import {processUserRegions, setUpPolygonDrawing, StoredShapeData} from '../../../docs/polygon_draw';
import * as resourceGetter from '../../../docs/resources';
import SettablePromise from '../../../docs/settable_promise';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const polyCoords = [
  {lng: 1, lat: 1},
  {lng: 1, lat: 2},
  {lng: 13, lat: 2},
  {lng: 13, lat: 1},
  {lng: 1, lat: 1},
];

let polyLatLng;
const firebaseCollection = {};
const calculatedData = {
  damage: 1,
  snapFraction: 0.6,
};

describe('Unit test for ShapeData', () => {
  loadScriptsBeforeForUnitTests('ee', 'maps', 'firebase');
  let polygonGeometry;
  let damageCollection;
  before(() => {
    polyLatLng = polyCoords.map((pair) => new google.maps.LatLng(pair));
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
    damageCollection = ee.FeatureCollection([
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

  it('Shows calculating before update finishes', () => {
    // polygon_draw.update creates an ee.List to evaluate the numbers it needs.
    // To make sure that update calculation does not finish until we're ready,
    // lightly wrap ee.List.evaluate and wait on a Promise to finish.
    // This function will be called below when we're ready for the calculation
    // to be finished.
    let callWhenCalculationCanComplete = null;
    const promiseThatAllPreCalculationAssertionsAreDone =
        new Promise((resolve) => callWhenCalculationCanComplete = resolve);
    // Replace ee.List so that we can have access to the returned object and
    // change its evaluate call.
    const oldList = ee.List;
    ee.List = (list) => {
      ee.List = oldList;
      const returnValue = ee.List(list);
      // Replace returnValue.evaluate so that we can delay calling the callback
      // until the calculation is supposed to have completed.
      const oldEvaluate = returnValue.evaluate;
      returnValue.evaluate = (callback) => {
        returnValue.evaluate = oldEvaluate;
        // Do the evaluate, but don't return back to polygon_draw.update's
        // callback handler until our pre-calculation assertions are done.
        returnValue.evaluate(
            (result, err) => promiseThatAllPreCalculationAssertionsAreDone.then(
                () => callback(result, err)));
      };
      return returnValue;
    };
    const event = new Event('overlaycomplete');
    cy.document()
        .then((document) => {
          const div = document.createElement('div');
          document.body.appendChild(div);
          const map =
              new google.maps.Map(div, {center: {lat: 0, lng: 0}, zoom: 1});
          event.overlay = new google.maps.Polygon({
            map: map,
            paths: [{lat: 0, lng: 0}, {lat: 1, lng: 1}, {lat: 0, lng: 1}],
          });
          return setUpPolygonDrawing(map, Promise.resolve());
        })
        .then((drawingManager) => {
          google.maps.event.trigger(drawingManager, 'overlaycomplete', event);
          updatePromise.setPromise(event.resultPromise);
        });
    firebaseCollection.add = () => Promise.resolve({id: 'id'});
    const updatePromise = new SettablePromise();
    cy.get('.popup-calculated-data').contains('calculating');
    cy.get('.popup-calculated-data')
        .should('have.css', 'color')
        .and('eq', 'rgb(128, 128, 128)')
        .then(() => callWhenCalculationCanComplete(null));
    cy.wrap(updatePromise.getPromise());
    cy.get('.popup-calculated-data')
        .should('have.css', 'color')
        .and('eq', 'rgb(0, 0, 0)');
  });

  it('Draws marker, edits notes, then deletes', () => {
    // Accept confirmation when it happens.
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    firebaseCollection.add = () => {};
    firebaseCollection.doc = () => {};
    const addStub =
        cy.stub(firebaseCollection, 'add').returns(Promise.resolve({id: 'id'}));
    const docStubObject = {};
    docStubObject.set = () => {};
    docStubObject.delete = () => {};
    const setStub = cy.stub(docStubObject, 'set').returns(Promise.resolve());
    const deleteStub =
        cy.stub(docStubObject, 'delete').returns(Promise.resolve());
    const docStub = cy.stub(firebaseCollection, 'doc').returns(docStubObject);
    const updatePromise = new SettablePromise();
    const event = new Event('overlaycomplete');
    let marker;
    cy.document()
        .then((document) => {
          const div = document.createElement('div');
          document.body.appendChild(div);
          const map =
              new google.maps.Map(div, {center: {lat: 0, lng: 0}, zoom: 1});
          marker =
              new google.maps.Marker({map: map, position: {lat: 0, lng: 0}});
          event.overlay = marker;
          return setUpPolygonDrawing(map, Promise.resolve());
        })
        .then((drawingManager) => {
          google.maps.event.trigger(drawingManager, 'overlaycomplete', event);
          updatePromise.setPromise(event.resultPromise);
        })
        .then(() => google.maps.event.trigger(marker, 'click'))
        .then(() => {
          expect(addStub).to.be.calledOnce;
          pressPopupButton('edit');
          // Force-type because we don't have a real page, so may not be
          // visible.
          cy.get('[class="notes"]').type('my notes', {force: true});
          pressPopupButton('save').then(() => {
            expect(docStub).to.be.calledOnce;
            expect(setStub).to.be.calledOnce;
          });
          pressPopupButton('delete').then(
              () => {
                expect(deleteStub).to.be.calledOnce;
                expect(confirmStub).to.be.calledOnce;
              });
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
  mockPolygon.getPath = () => polyLatLng;
  return mockPolygon;
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

/**
 * Clicks a button inside the map with the given id.
 * @param {string} button id of html button we want to click
 * @return {Cypress.Chainable} result of get
 */
function pressPopupButton(button) {
  // Force-click because we don't have a real page, so who knows what elements
  // are "visible".
  return cy.get(':button').contains(button).click({force: true});
}
