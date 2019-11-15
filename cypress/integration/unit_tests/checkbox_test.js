import {LayerType} from '../../../docs/firebase_layers.js';
import {addLayer, addScoreLayer, deckGlArray, DeckParams, layerArray, LayerDisplayData, removeScoreLayer, scoreLayerName, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from '../../../docs/layer_util.js';
import * as loading from '../../../docs/loading';
import {CallbackLatch} from '../../support/callback_latch';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const mockData = {};

const colorProperties = {
  'single-color': 'yellow',
};
const mockFirebaseLayers = [
  {
    'ee-name': 'asset0',
    'asset-type': LayerType.FEATURE_COLLECTION,
    'display-name': 'asset0',
    'display-on-load': true,
    'color-function': colorProperties,
    'index': 0,
  },
  {
    'ee-name': 'asset1',
    'asset-type': LayerType.FEATURE_COLLECTION,
    'display-name': 'asset1',
    'display-on-load': false,
    'color-function': colorProperties,
    'index': 1,
  },
  {
    'ee-name': 'asset2',
    'asset-type': LayerType.FEATURE_COLLECTION,
    'display-name': 'asset2',
    'display-on-load': false,
    'color-function': colorProperties,
    'index': 2,
  },
  {
    'ee-name': 'image_asset',
    'asset-type': LayerType.IMAGE,
    'display-name': 'image',
    'display-on-load': true,
    'index': 3,
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
    layerArray[0] =
        new LayerDisplayData(new DeckParams('asset0', colorProperties), true);
    layerArray[0].data = mockData;
    layerArray[1] =
        new LayerDisplayData(new DeckParams('asset1', colorProperties), false);
    layerArray[1].data = mockData;
    layerArray[2] =
        new LayerDisplayData(new DeckParams('asset2', colorProperties), false);
    // Initialize deck object in production.
    setMapToDrawLayersOn(null);
    deckGlArray.length = 0;
    deckGlArray[0] = new deck.GeoJsonLayer({});
    deckGlArray[1] = new deck.GeoJsonLayer({});
  });

  it('displays a hidden but loaded layer', () => {
    expect(layerArray[1].displayed).to.be.false;
    expect(layerArray[1].data).to.not.be.null;

    expect(toggleLayerOn(mockFirebaseLayers[1])).to.be.null;
    expect(layerArray[1].displayed).to.be.true;
    const layerProps = deckGlArray[1].props;
    expect(layerProps).to.have.property('id', 'asset1');
    expect(layerProps).to.have.property('visible', true);
    expect(layerProps).to.have.property('data', mockData);
  });

  it('loads a hidden layer and displays', () => {
    expect(layerArray[2].displayed).to.be.false;
    expect(layerArray[2].data).to.be.undefined;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    const promise = toggleLayerOn(mockFirebaseLayers[2]);
    expect(promise).to.not.be.null;
    expect(layerArray[2].displayed).to.be.true;
    expect(layerArray[2].data).to.be.undefined;
    callback(emptyList);
    cy.wrap(promise).then(() => {
      expect(layerArray[2].displayed).to.be.true;
      expect(layerArray[2].data).to.not.be.null;
      const layerProps = deckGlArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', true);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });

  it('check hidden layer, then uncheck before list evaluation', () => {
    expect(layerArray[2].displayed).to.be.false;
    expect(layerArray[2].data).to.be.undefined;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    const promise = toggleLayerOn(mockFirebaseLayers[2]);
    expect(promise).to.not.be.null;
    expect(layerArray[2].displayed).to.be.true;
    expect(layerArray[2].data).to.be.undefined;
    toggleLayerOff(2);
    callback(emptyList);
    cy.wrap(promise).then(() => {
      expect(layerArray[2].displayed).to.be.false;
      expect(layerArray[2].data).to.not.be.null;
      const layerProps = deckGlArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', false);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });

  it('checks hidden layer, unchecks, checks before list evaluation', () => {
    expect(layerArray[2].displayed).to.be.false;
    expect(layerArray[2].data).to.be.undefined;

    const emptyList = [];
    let callback = null;
    stubForEmptyList((callb) => callback = callb);
    const promise = toggleLayerOn(mockFirebaseLayers[2]);
    expect(promise).to.not.be.null;
    expect(layerArray[2].displayed).to.be.true;
    expect(layerArray[2].data).to.be.undefined;
    toggleLayerOff(2);
    const secondPromise = toggleLayerOn(mockFirebaseLayers[2]);
    expect(layerArray[2].displayed).to.be.true;
    expect(layerArray[2].data).to.be.undefined;
    expect(secondPromise).equals(promise);
    callback(emptyList);
    cy.wrap(promise).then(() => {
      expect(layerArray[2].displayed).to.be.true;
      expect(layerArray[2].data).to.not.be.null;
      const layerProps = deckGlArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', true);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });

  // For the next three tests, we do the following setup:
  // 1. Use a real map, since we want to see that it has an entry in its
  // overlayMapTypes.
  // 2. Sub in trivial image, and control the #getMap method of that image so
  // that we can delay the callback until we're ready.
  // 3. Stub the loading elements, so we can check when loading starts/ends.
  it('caches computed image overlay and starts loading on EE request', () => {
    const map = createGoogleMap();
    const latch = stubOutImageAndGetLatch();
    const loadingStartedStub = cy.stub(loading, 'addLoadingElement');
    const loadingFinishedStub = cy.stub(loading, 'loadingElementFinished');

    // Start the test.
    const promise = addLayer(mockFirebaseLayers[3], map);
    expect(promise).to.not.be.null;
    expect(loadingStartedStub).to.be.calledOnce;
    // Loading can't finish until EE evaluation finishes, which we've frozen.
    expect(loadingFinishedStub).to.not.be.called;
    expect(map.overlayMapTypes).to.have.length(0);
    // Release evaluation.
    latch.release();
    let overlay = null;
    cy.wrap(promise)
        .then(() => {
          expect(loadingFinishedStub).to.be.calledOnce;
          overlay = map.overlayMapTypes.getAt(3);
          expect(overlay).is.not.null;
          // Turn layer off: disappears from map.
          toggleLayerOff(3, map);
          expect(map.overlayMapTypes.getAt(3)).is.null;

          // Turn overlay back on.
          const togglePromise = toggleLayerOn(mockFirebaseLayers[3], map);
          expect(togglePromise).to.not.be.null;
          return togglePromise;
        })
        .then(() => {
          const nextOverlay = map.overlayMapTypes.getAt(3);
          expect(nextOverlay).is.not.null;
          // We got the exact same object! Note that expect({}).not.equals({}).
          expect(nextOverlay).equals(overlay);
        });
  });

  it('toggles off computed image overlay before EE finishes', () => {
    const map = createGoogleMap();
    const latch = stubOutImageAndGetLatch();
    const loadingStartedStub = cy.stub(loading, 'addLoadingElement');
    const loadingFinishedStub = cy.stub(loading, 'loadingElementFinished');

    // Start the test.
    const promise = addLayer(mockFirebaseLayers[3], map);
    expect(promise).to.not.be.null;
    // Loading has started, but map is unaffected.
    expect(loadingStartedStub).to.be.calledOnce;
    expect(map.overlayMapTypes).to.have.length(0);
    expect(map.overlayMapTypes.getAt(3)).to.be.undefined;

    // Before EE rendering finishes, toggle layer off.
    toggleLayerOff(3, map);
    // Overlay list now has null instead of undefined, but no biggie.
    expect(map.overlayMapTypes.getAt(3)).to.be.null;

    // Loading can't finish until EE evaluation finishes, which we've frozen.
    expect(loadingFinishedStub).to.not.be.called;
    // Release evaluation.
    latch.release();
    cy.wrap(promise)
        .then(() => {
          expect(loadingFinishedStub).to.be.calledOnce;
          expect(map.overlayMapTypes.getAt(3)).to.be.null;

          // Turn overlay back on.
          const togglePromise = toggleLayerOn(mockFirebaseLayers[3], map);
          expect(togglePromise).to.not.be.null;
          return togglePromise;
        })
        .then(() => expect(map.overlayMapTypes.getAt(3)).is.not.null);
  });

  it('toggles off and on computed image overlay before EE finishes', () => {
    const map = createGoogleMap();
    const latch = stubOutImageAndGetLatch();
    const loadingStartedStub = cy.stub(loading, 'addLoadingElement');
    const loadingFinishedStub = cy.stub(loading, 'loadingElementFinished');

    // Start the test.
    const promise = addLayer(mockFirebaseLayers[3], map);
    expect(promise).to.not.be.null;
    // Loading has started, but map is unaffected.
    expect(loadingStartedStub).to.be.calledOnce;
    expect(map.overlayMapTypes).to.have.length(0);
    expect(map.overlayMapTypes.getAt(3)).to.be.undefined;

    // Before EE rendering finishes, toggle layer off.
    toggleLayerOff(3, map);
    // Overlay list now has null instead of undefined, but no biggie.
    expect(map.overlayMapTypes.getAt(3)).to.be.null;

    // Still before evaluation finishes, toggle back on.
    const togglePromise = toggleLayerOn(mockFirebaseLayers[3], map);
    expect(togglePromise).equals(promise);
    // Overlay list now has null instead of undefined, but no biggie.
    expect(map.overlayMapTypes.getAt(3)).to.be.null;

    // Loading can't finish until EE evaluation finishes, which we've frozen.
    expect(loadingFinishedStub).to.not.be.called;

    // Release evaluation.
    latch.release();
    cy.wrap(promise).then(() => {
      expect(loadingFinishedStub).to.be.calledOnce;
      expect(map.overlayMapTypes.getAt(3)).to.not.be.null;
    });
  });

  it('tests score layer and deck management', () => {
    // Re-initialize deck, this time with a spy so we can observe what happens.
    const deckSpy = cy.spy(deck, 'GoogleMapsOverlay');
    setMapToDrawLayersOn(null);
    const overlaySpy = cy.spy(deckSpy.returnValues[0], 'setProps');
    let numCalls = 0;
    /**
     * @return {array<deck.GeoJsonLayer>}
     */
    function getLatestLayer() {
      return overlaySpy.args[numCalls++][0].layers;
    }

    let resolveFunction = null;
    const promise = new Promise((resolve) => resolveFunction = resolve);

    const scorePromise = addScoreLayer(promise);
    expect(scorePromise).to.not.be.null;
    // Nothing happens until promise we passed in is resolved.
    expect(overlaySpy).to.not.be.called;
    const promiseResult = ['a'];
    const secondPromiseResult = ['b'];
    resolveFunction(promiseResult);

    cy.wrap(scorePromise)
        .then(() => {
          expect(overlaySpy).to.be.calledOnce;
          const firstLayers = getLatestLayer();
          expect(firstLayers).to.have.length(3);
          const props = firstLayers[2].props;
          expect(props.data).to.eql(promiseResult);
          expect(props.visible).to.be.true;
          expect(props.id).to.eql(scoreLayerName);

          // Test remove.
          removeScoreLayer();
          expect(overlaySpy).to.be.calledTwice;
          const secondLayers = getLatestLayer();
          expect(secondLayers).to.have.length(2);
          expect(secondLayers[1].props.id).to.not.eql(scoreLayerName);

          // Add score layer back in, with a different value.
          const secondPromise =
              new Promise((resolve) => resolveFunction = resolve);
          const secondScorePromise = addScoreLayer(secondPromise);
          // Nothing happens until promise is resolved.
          expect(overlaySpy).to.be.calledTwice;
          resolveFunction(secondPromiseResult);
          return secondScorePromise;
        })
        .then(() => {
          expect(overlaySpy).to.be.calledThrice;
          const thirdLayers = getLatestLayer();
          expect(thirdLayers).to.have.length(3);
          const props = thirdLayers[2].props;
          expect(props.data).to.eql(secondPromiseResult);
          expect(props.visible).to.be.true;
          expect(props.id).to.eql(scoreLayerName);
        });
  });
});

describe('Unit test for toggleLayerOff', () => {
  it('hides a displayed layer', () => {
    expect(layerArray[0].displayed).to.be.true;
    expect(layerArray[0].data).to.not.be.null;

    toggleLayerOff(0);
    expect(layerArray[0].displayed).to.be.false;
    expect(layerArray[0].data).to.not.be.null;
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

/** @return {google.maps.Map} for use in a test */
function createGoogleMap() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return new google.maps.Map(div, {center: {lat: 0, lng: 0}, zoom: 1});
}

/**
 * Stubs out the ee.Image constructor to use a dummy image and returns a
 * CallbackLatch that will release the image's #getMap callback.
 * @return {CallbackLatch}
 */
function stubOutImageAndGetLatch() {
  const image = ee.Image.constant(0);
  const oldImageFunction = ee.Image;
  ee.Image = () => {
    ee.Image = oldImageFunction;
    return image;
  };
  const oldGetMap = image.getMap;
  const latch = new CallbackLatch();
  image.getMap = (props) => {
    image.getMap = oldGetMap;
    props.callback = latch.delayedCallback(props.callback);
    return image.getMap(props);
  };
  return latch;
}
