import {initializeFirebaseLayers, LayerType} from '../../../docs/firebase_layers.js';
import {deckGlArray, DisplayedLayerData, mapOverlayArray, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from '../../../docs/layer_util.js';
import * as loading from '../../../docs/loading';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const mockData = {};

const mockFirebaseLayers = [
  {
    'ee-name': 'asset0',
    'asset-type': LayerType.FEATURE_COLLECTION,
    'display-name': 'asset0',
    'display-on-load': true,
    'color-function': {'single-color': 'yellow'},
    'index': 0,
  },
  {
    'asset-type': LayerType.FEATURE_COLLECTION,
    'ee-name': 'asset1',
    'display-name': 'asset1',
    'display-on-load': false,
    'color-function': {'single-color': 'yellow'},
    'index': 1,
  },
  {
    'asset-type': LayerType.FEATURE_COLLECTION,
    'ee-name': 'asset2',
    'display-name': 'asset2',
    'display-on-load': false,
    'color-function': {'single-color': 'yellow'},
    'index': 2,
  },
];

describe('Unit test for toggleLayerOn', () => {
  loadScriptsBeforeForUnitTests('ee', 'deck', 'maps');
  before(() => {
    // Stub out loading update attempts: they pollute console with errors.
    loading.addLoadingElement = () => {};
    loading.loadingElementFinished = () => {};
  });
  beforeEach(() => {
    mapOverlayArray[0] = new DisplayedLayerData('asset0', true);
    mapOverlayArray[0].data = mockData;
    mapOverlayArray[1] = new DisplayedLayerData('asset1', false);
    mapOverlayArray[1].data = mockData;
    mapOverlayArray[2] = new DisplayedLayerData('asset2', false);
    initializeFirebaseLayers(mockFirebaseLayers);
    // Initialize deck object in production.
    setMapToDrawLayersOn(null);
    deckGlArray[0] = new deck.GeoJsonLayer({});
    deckGlArray[1] = new deck.GeoJsonLayer({});
  });

  it('displays a hidden but loaded layer', () => {
    expect(mapOverlayArray[1].displayed).to.equals(false);
    expect(mapOverlayArray[1].data).to.not.be.null;

    toggleLayerOn(mockFirebaseLayers[1]);
    expect(mapOverlayArray[1].displayed).to.equals(true);
    const layerProps = deckGlArray[1].props;
    expect(layerProps).to.have.property('id', 'asset1');
    expect(layerProps).to.have.property('visible', true);
    expect(layerProps).to.have.property('data', mockData);
  });

  it('loads a hidden layer and displays', () => {
    expect(mapOverlayArray[2].displayed).to.equals(false);
    expect(mapOverlayArray[2].data).to.be.undefined;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    toggleLayerOn(mockFirebaseLayers[2]);
    callback(emptyList);
    // Evaluate after the promise finishes by using an instant wait.
    // TODO(janakr): Here and below, consider returning a Promise from
    //  toggleLayerOn that can be waited on instead of this event-loop push.
    cy.wait(0).then(() => {
      expect(mapOverlayArray[2].displayed).to.equals(true);
      expect(mapOverlayArray[2].data).to.not.be.null;
      const layerProps = deckGlArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', true);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });

  it('check hidden layer, then uncheck before list evaluation', () => {
    expect(mapOverlayArray[2].displayed).to.equals(false);
    expect(mapOverlayArray[2].data).to.be.undefined;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    toggleLayerOn(mockFirebaseLayers[2]);
    toggleLayerOff(2);
    callback(emptyList);

    // Evaluate after the promise finishes by using an instant wait.
    cy.wait(0).then(() => {
      expect(mapOverlayArray[2].displayed).to.equals(false);
      expect(mapOverlayArray[2].data).to.not.be.null;
      const layerProps = deckGlArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', false);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });
});

describe('Unit test for toggleLayerOff', () => {
  it('hides a displayed layer', () => {
    expect(mapOverlayArray[0].displayed).to.equals(true);
    expect(mapOverlayArray[0].data).to.not.be.null;

    toggleLayerOff(0);
    expect(mapOverlayArray[0].displayed).to.equals(false);
    expect(mapOverlayArray[0].data).to.not.be.null;
    const layerProps = deckGlArray[0].props;
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
