import {ShapeData} from '../../client-side/static/polygon_draw';

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
  // Reset firebaseCollection's dummy methods.
  beforeEach(() => {
    for (const prop in firebaseCollection) {
      if (firebaseCollection.hasOwnProperty(prop)) {
        delete firebaseCollection[prop];
      }
    }
  });

  it('Add shape', () => {
    const underTest = new ShapeData(null, 'my notes');
    const mockPolygon = makeMockPolygon();
    const records = [];
    firebaseCollection.add = recordRecord(records, {id: 'new_id'});
    underTest.update(mockPolygon);
    expect(records).to.eql([{
      damage: 1,
      geometry: [new firebase.firestore.GeoPoint(0, 1)],
      notes: 'my notes',
    }]);
    expect(underTest.id).to.eql('new_id');
    expect(ShapeData.pendingWriteCount).to.eql(0);
  });

  it('Update shape', () => {
    const underTest = new ShapeData('my_id', 'my notes');
    const mockPolygon = makeMockPolygon();
    const records = [];
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {set: recordRecord(records, null)};
    };
    underTest.update(mockPolygon);
    expect(ids).to.eql(['my_id']);
    expect(records).to.eql([{
      damage: 1,
      geometry: [new firebase.firestore.GeoPoint(0, 1)],
      notes: 'my notes',
    }]);
    expect(underTest.id).to.eql('my_id');
    expect(ShapeData.pendingWriteCount).to.eql(0);
  });

  it('Delete shape', () => {
    const underTest = new ShapeData('my_id', 'my notes');
    const mockPolygon = makeMockPolygon();
    mockPolygon.getMap = () => null;
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {
        delete: () => new FakePromise(undefined),
      };
    };
    underTest.update(mockPolygon);
    expect(ids).to.eql(['my_id']);
    expect(underTest.id).to.eql('my_id');
    expect(ShapeData.pendingWriteCount).to.eql(0);
  });

  it('Update while update pending', () => {
    const underTest = new ShapeData('my_id', 'my notes');
    const mockPolygon = makeMockPolygon();
    const records = [];
    const ids = [];
    const setThatTriggersNewUpdate = {
      set: (record) => {
        underTest.update(mockPolygon, 'racing notes');
        expect(underTest.notes).to.eql('racing notes');
        expect(underTest.state).to.eql(ShapeData.State.QUEUED_WRITE);
        records.push(record);
        expect(ShapeData.pendingWriteCount).to.eql(1);
        // Put back usual set for next run.
        setThatTriggersNewUpdate.set = recordRecord(records, null);
        return new FakePromise(null);
      },
    };
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return setThatTriggersNewUpdate;
    };
    underTest.update(mockPolygon);
    expect(ids).to.eql(['my_id', 'my_id']);
    const geometry = [new firebase.firestore.GeoPoint(0, 1)];
    expect(records).to.eql([
      {geometry: geometry, notes: 'my notes'},
      {geometry: geometry, notes: 'racing notes'},
    ]);
    expect(underTest.id).to.eql('my_id');
    expect(ShapeData.pendingWriteCount).to.eql(0);
  });

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
      expect(ShapeData.pendingWriteCount).to.eql(1);
      records.push(record);
      return new FakePromise(retval);
    };
  }
});
