import {initializeFirebaseLayers} from '../../../docs/firebase_layers';
import {layerArray, layerMap, LayerMapValue, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from '../../../docs/layer_util';
import {loadScriptsBefore} from '../../support/script_loader';

const mockData = {};

const mockFirebaseLayers = {
  'asset0': {
    'asset-type': 1,
    'display-name': 'asset0',
    'display-on-load': true,
    'color-fxn': {'single-color': 'yellow'},
  },
  'asset1': {
    'asset-type': 1,
    'display-name': 'asset1',
    'display-on-load': false,
    'color-fxn': {'single-color': 'yellow'},
  },
  'asset2': {
    'asset-type': 1,
    'display-name': 'asset2',
    'display-on-load': false,
    'color-fxn': {'single-color': 'yellow'},
  },
};

describe('Unit test for toggleLayerOn', () => {
  loadScriptsBefore('ee', 'deck', 'maps');
  beforeEach(() => {
    layerMap.set('asset0', new LayerMapValue(mockData, 0, true));
    layerMap.set('asset1', new LayerMapValue(mockData, 1, false));
    layerMap.set('asset2', new LayerMapValue(null, 2, false));
    initializeFirebaseLayers(mockFirebaseLayers);
    // Initialize deck object in production.
    setMapToDrawLayersOn(null);
    layerArray[0] = new deck.GeoJsonLayer({});
    layerArray[1] = new deck.GeoJsonLayer({});
  });

  it('displays a hidden but loaded layer', () => {
    expect(layerMap.get('asset1').displayed).to.equals(false);
    expect(layerMap.get('asset1').data).to.not.be.null;

    toggleLayerOn('asset1');
    expect(layerMap.get('asset1').displayed).to.equals(true);
    const layerProps = layerArray[1].props;
    expect(layerProps).to.have.property('id', 'asset1');
    expect(layerProps).to.have.property('visible', true);
    expect(layerProps).to.have.property('data', mockData);
  });

  it('loads a hidden layer and displays', () => {
    expect(layerMap.get('asset2').displayed).to.equals(false);
    expect(layerMap.get('asset2').data).to.be.null;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    toggleLayerOn('asset2');
    callback(emptyList);
    // Evaluate after the promise finishes by using an instant wait.
    // TODO(janakr): Here and below, consider returning a Promise from
    //  toggleLayerOn that can be waited on instead of this event-loop push.
    cy.wait(0).then(() => {
      expect(layerMap.get('asset2').displayed).to.equals(true);
      expect(layerMap.get('asset2').data).to.not.be.null;
      const layerProps = layerArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', true);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });

  it('check hidden layer, then uncheck before list evaluation', () => {
    expect(layerMap.get('asset2').displayed).to.equals(false);
    expect(layerMap.get('asset2').data).to.be.null;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    toggleLayerOn('asset2');
    toggleLayerOff('asset2');
    callback(emptyList);

    // Evaluate after the promise finishes by using an instant wait.
    cy.wait(0).then(() => {
      expect(layerMap.get('asset2').displayed).to.equals(false);
      expect(layerMap.get('asset2').data).to.not.be.null;
      const layerProps = layerArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', false);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });
});

describe('Unit test for toggleLayerOff', () => {
  it('hides a displayed layer', () => {
    expect(layerMap.get('asset0').displayed).to.equals(true);
    expect(layerMap.get('asset0').data).to.not.be.null;

    toggleLayerOff('asset0');
    expect(layerMap.get('asset0').displayed).to.equals(false);
    expect(layerMap.get('asset0').data).to.not.be.null;
    const layerProps = layerArray[0].props;
    expect(layerProps).to.have.property('id', 'asset0');
    expect(layerProps).to.have.property('visible', false);
    expect(layerProps).to.have.property('data', mockData);
  });
});

/**
 * Mocks out a FeatureCollection created for 'asset2'. Assumes that production
 * code will call toList().evaluate(callback) on the resulting collection, and
 * passes that callback to the given callbackReceiver.
 *
 * @param {Function} callbackReceiver
 */
function stubForEmptyList(callbackReceiver) {
  const emptyCollection = ee.FeatureCollection([]);
  cy.stub(ee, 'FeatureCollection').withArgs('asset2').returns(emptyCollection);
  const emptyEeList = ee.List([]);
  cy.stub(emptyCollection, 'toList').returns(emptyEeList);
  cy.stub(emptyEeList, 'evaluate').callsFake(callbackReceiver);
}
