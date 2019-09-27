import {PolygonData} from '../../../client-side/static/polygon_draw';

describe('Unit test for PolygonData', () => {

  it('Sends update to Firestore', () => {
    const underTest = new PolygonData(null, 'my notes');
    const mockPolygon = {};
    const mockCollection = firebase.firestore();
    mockCollection.doc = (id) => {

    }
    mockPolygon.getMap = () => {return true};
    underTest.update({}, undefined);
  });
});

