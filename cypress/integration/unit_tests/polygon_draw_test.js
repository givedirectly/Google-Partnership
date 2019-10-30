import {processUserRegions, StoredShapeData} from '../../../docs/polygon_draw';
import {loadScriptsBefore} from '../../support/script_loader';
import {getResources} from '../../../docs/resources';

// Name of collection doesn't matter.
const firebaseCollection = firebase.firestore().collection('usershapes-test');
/**
 * Fake of the Promise class. Needed because Promise executes async, so if we
 * use real Promises, we lose control of execution order in the test.
 */
class FakePromise {
  /**
   * Constructor.
   *
   * @param {Object} thenArg Argument to invoke then with.
   */
  constructor(thenArg) {
    this.thenArg = thenArg;
  }

  /**
   * Mirrors Promise.then. Calls func with this.thenArg.
   *
   * @param {Function} func Function to invoke.
   * @return {Object} dummy object with dummy catch method.
   */
  then(func) {
    func(this.thenArg);
    return {catch: () => undefined};
  }
}

describe('Unit test for ShapeData', () => {
  loadScriptsBefore('ee', 'maps');
  let mockDamage;
  let mockFilteredDamage;
  let mockSize;
  const featureCollectionApi = {filterBounds: (poly) => {}};
  const filteredFeatureCollectionApi = {size: () => {}};
  const sizeApi = {evaluate: (callb) => {}};
  before(() => {
    mockDamage = Cypress.sinon.mock(featureCollectionApi);
    mockFilteredDamage = Cypress.sinon.mock(filteredFeatureCollectionApi);
    mockSize = Cypress.sinon.mock(sizeApi);
  });
  // Reset firebaseCollection's dummy methods.
  beforeEach(() => {
    for (const prop in firebaseCollection) {
      if (firebaseCollection.hasOwnProperty(prop)) {
        delete firebaseCollection[prop];
      }
    }
    // Make sure .get() succeeds.
    firebaseCollection.get = () => [];

    // Set up EarthEngine.
    cy.stub(ee, 'FeatureCollection').withArgs(getResources().damage).returns(featureCollectionApi);
    // Make sure userShapes is set in the code.
    return cy.wrap(processUserRegions(null, Promise.resolve(null)));
  });

  afterEach(() => {
    mockDamage.verify();
    mockFilteredDamage.verify();
    mockSize.verify();
  });

  it('Add shape', () => {
    expectEarthEngineCalled();
    const popup = new StubPopup();
    const underTest = new StoredShapeData(null, null, null, popup);
    const records = [];
    firebaseCollection.add = recordRecord(records, {id: 'new_id'});
    popup.notes = 'my notes';
    underTest.update();
    expect(records).to.eql([{
      calculatedData: {damage: 1},
      geometry: [new firebase.firestore.GeoPoint(0, 1)],
      notes: 'my notes',
    }]);
    expect(underTest.id).to.eql('new_id');
    expect(StoredShapeData.pendingWriteCount).to.eql(0);
  });

  it('Update shape', () => {
    expectEarthEngineNotCalled();
    const popup = new StubPopup();
    popup.setCalculatedData({damage: 1});
    const geometry = [new firebase.firestore.GeoPoint(0, 1)];
    const underTest = new StoredShapeData('my_id', 'my notes', geometry, popup);
    const records = [];
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {set: recordRecord(records, null)};
    };
    popup.notes = 'new notes';
    underTest.update();
    expect(ids).to.eql(['my_id']);
    expect(records).to.eql([{
      calculatedData: {damage: 1},
      geometry: geometry,
      notes: 'new notes',
    }]);
    expect(underTest.id).to.eql('my_id');
    expect(StoredShapeData.pendingWriteCount).to.eql(0);
  });

  it('Delete shape', () => {
    expectEarthEngineNotCalled();
    const popup = new StubPopup();
    popup.setCalculatedData({damage: 1});
    const geometry = [new firebase.firestore.GeoPoint(0, 1)];
    const underTest = new StoredShapeData('my_id', 'my notes', geometry, popup);
    popup.mapFeature.getMap = () => null;
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {
        delete: () => new FakePromise(undefined),
      };
    };
    underTest.update();
    expect(ids).to.eql(['my_id']);
    expect(underTest.id).to.eql('my_id');
    expect(StoredShapeData.pendingWriteCount).to.eql(0);
  });

  it('Update while update pending', () => {
    expectEarthEngineNotCalled();
    const popup = new StubPopup();
    const calculatedData = {damage: 1};
    popup.setCalculatedData(calculatedData);
    const geometry = [new firebase.firestore.GeoPoint(0, 1)];
    const underTest = new StoredShapeData('my_id', 'my notes', geometry, popup);
    const records = [];
    const ids = [];
    const setThatTriggersNewUpdate = {
      set: (record) => {
        popup.notes = 'racing notes';
        underTest.update();
        expect(popup.calculatedData).to.eql(calculatedData);
        expect(underTest.state).to.eql(StoredShapeData.State.QUEUED_WRITE);
        records.push(record);
        expect(StoredShapeData.pendingWriteCount).to.eql(1);
        // Put back usual set for next run.
        setThatTriggersNewUpdate.set = recordRecord(records, null);
        return new FakePromise(null);
      },
    };
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return setThatTriggersNewUpdate;
    };
    popup.notes = 'new notes';
    underTest.update();
    expect(ids).to.eql(['my_id', 'my_id']);
    expect(records).to.have.length(2);
    expect(records).to.eql([
      {calculatedData: calculatedData, geometry: geometry, notes: 'new notes'},
      {
        calculatedData: calculatedData,
        geometry: geometry,
        notes: 'racing notes',
      },
    ]);
    expect(underTest.id).to.eql('my_id');
    expect(StoredShapeData.pendingWriteCount).to.eql(0);
  });

  it('Skips update if nothing changed', () => {
    expectEarthEngineNotCalled();
    const popup = new StubPopup();
    popup.notes = 'my notes';
    const calculatedData = {damage: 1};
    popup.setCalculatedData(calculatedData);
    popup.setPendingCalculation = () => {
      throw new Error('Unexpected calculation');
    };
    popup.setCalculatedData = () => {
      throw new Error('Unexpected calculation');
    };
    const geometry = [new firebase.firestore.GeoPoint(0, 1)];
    const underTest = new StoredShapeData('my_id', 'my notes', geometry, popup);
    firebaseCollection.doc = () => {
      throw new Error('Unexpected Firestore call');
    };
    underTest.update();
    // Nothing crashed.
  });

  it('Skips recalculation if geometry unchanged', () => {
    expectEarthEngineNotCalled();
    const popup = new StubPopup();
    const calculatedData = {damage: 1};
    popup.setCalculatedData(calculatedData);
    popup.setPendingCalculation = () => {
      throw new Error('Unexpected calculation');
    };
    popup.setCalculatedData = () => {
      throw new Error('Unexpected calculation');
    };
    const geometry = [new firebase.firestore.GeoPoint(0, 1)];
    const ids = [];
    const records = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {set: recordRecord(records, null)};
    };
    const underTest = new StoredShapeData('my_id', 'my notes', geometry, popup);
    popup.notes = 'new notes';
    underTest.update();
    expect(ids).to.eql(['my_id']);
    expect(records).to.eql([{
      calculatedData: calculatedData,
      geometry: geometry,
      notes: 'new notes',
    }]);
    expect(underTest.id).to.eql('my_id');
    expect(StoredShapeData.pendingWriteCount).to.eql(0);
  });

  function expectEarthEngineCalled() {
    mockDamage.expects('filterBounds').once().returns(filteredFeatureCollectionApi);
    mockFilteredDamage.expects('size').once().returns(sizeApi);
    mockSize.expects('evaluate').once().callsFake((callb) => callb(1));
  }

  function expectEarthEngineNotCalled() {
    mockDamage.expects('filterBounds').never();
    mockFilteredDamage.expects('size').never();
    mockSize.expects('evaluate').never();
  }
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
    return new FakePromise(retval);
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
  const latlng = {lat: () => 0, lng: () => 1};
  mockPolygon.getPath = () => [latlng];
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
