import {layerMap, LayerMapValue, toggleLayer} from '../../../client-side/static/layer_util';

const mockOverlay = {};

layerMap['asset0'] = new LayerMapValue(mockOverlay, 0, true);
layerMap['asset1'] = new LayerMapValue(mockOverlay, 1, false);
layerMap['asset2'] = new LayerMapValue(null, 2, false);


describe('Unit test for toggleLayer.js', () => {
  it('hides a displayed layer', () => {

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    let mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(0, null);
    toggleLayer(map, 'asset0');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset0'].displayed).to.equals(false);
  });
});

describe('Unit test for toggleLayer.js', () => {
  it('displays a hidden but loaded layer', () => {
    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    let mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(1, mockOverlay);
    toggleLayer(map, 'asset1');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset1'].displayed).to.equals(true);
  });
});

describe('Unit test for toggleLayer.js', () => {
  it('loads a hidden layer and displays', () => {
    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    let mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(2, new ee.MapLayerOverlay());
    toggleLayer(map, 'asset2');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset2'].displayed).to.equals(true);
    expect(layerMap['asset2'].overlay).to.not.be.null;
  });
});
