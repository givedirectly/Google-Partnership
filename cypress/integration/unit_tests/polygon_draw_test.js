import {PolygonData} from '../../../client-side/static/polygon_draw';
import {firebaseCollection} from '../../support/mock_firebase';

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

describe('Unit test for PolygonData', () => {
  it('Add shape', () => {
    const underTest = new PolygonData(null, 'my notes');
    const mockPolygon = makeMockPolygon();
    const records = [];
    firebaseCollection.add = recordRecord(records, {id: 'new_id'});
    underTest.update(mockPolygon);
    expect(records).to.eql([{
      geometry: [new firebase.firestore.GeoPoint(0, 1)],
      notes: 'my notes',
    }]);
    expect(underTest.id).to.eql('new_id');
    expect(PolygonData.pendingWriteCount).to.eql(0);
  });

  it('Update shape', () => {
    const underTest = new PolygonData('my_id', 'my notes');
    const mockPolygon = makeMockPolygon();
    const records = [];
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {set: recordRecord(records, null)};
    };
    underTest.update(mockPolygon);
    expect(ids).to.eql(['my_id']);
    expect(records).to.eql([
      {geometry: [new firebase.firestore.GeoPoint(0, 1)], notes: 'my notes'}
    ]);
    expect(underTest.id).to.eql('my_id');
    expect(PolygonData.pendingWriteCount).to.eql(0);
  });

  it('Delete shape', () => {
    const underTest = new PolygonData('my_id', 'my notes');
    const mockPolygon = makeMockPolygon();
    mockPolygon.getMap = () => null;
    const records = [];
    const ids = [];
    firebaseCollection.doc = (id) => {
      ids.push(id);
      return {
        delete: () => new FakePromise(undefined)
      }
    };
    underTest.update(mockPolygon);
    expect(ids).to.eql(['my_id']);
    expect(underTest.id).to.eql('my_id');
    expect(PolygonData.pendingWriteCount).to.eql(0);
  });

  it('Update while update pending', () => {
    const underTest = new PolygonData('my_id', 'my notes');
    const mockPolygon = makeMockPolygon();
    const records = [];
    const ids = [];
    const setThatTriggersNewUpdate = {
      set: (record) => {
        underTest.update(mockPolygon, 'racing notes');
        expect(underTest.notes).to.eql('racing notes');
        expect(underTest.state).to.eql(PolygonData.State.QUEUED_WRITE);
        records.push(record);
        expect(PolygonData.pendingWriteCount).to.eql(1);
        // Put back usual set for next run.
        setThatTriggersNewUpdate.set = recordRecord(records, null);
        return new FakePromise(null);
      }
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
      {geometry: geometry, notes: 'racing notes'}
    ]);
    expect(underTest.id).to.eql('my_id');
    expect(PolygonData.pendingWriteCount).to.eql(0);
  });

  function makeMockPolygon() {
    const mockPolygon = {};
    mockPolygon.getMap = () => true;
    const latlng = {lat: () => 0, lng: () => 1};
    mockPolygon.getPath = () => [latlng];
    return mockPolygon;
  }

  function recordRecord(records, retval, expectedWriteCount = 1) {
    return (record) => {
      expect(PolygonData.pendingWriteCount).to.eql(expectedWriteCount);
      records.push(record);
      return new FakePromise(retval);
    }
  }
});
