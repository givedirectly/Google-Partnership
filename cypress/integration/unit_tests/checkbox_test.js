import {layerMap, LayerMapValue, toggleLayerOff, toggleLayerOn} from '../../../client-side/static/layer_util';

const mockOverlay = {};

// layerMap['asset0'] = new LayerMapValue(mockOverlay, 0, true);
// layerMap['asset1'] = new LayerMapValue(mockOverlay, 1, false);
// layerMap['asset2'] = new LayerMapValue(null, 2, false);

describe('Unit test for toggleLayerOn', () => {
  it('displays a hidden but loaded layer', () => {
    layerMap['asset1'] = new LayerMapValue(mockOverlay, 1, false);

    expect(layerMap['asset1'].displayed).to.equals(false);
    expect(layerMap['asset1'].overlay).to.not.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(1, mockOverlay);
    toggleLayerOn(map, 'asset1');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset1'].displayed).to.equals(true);
  });

  it('loads a hidden layer and displays', () => {
    layerMap['asset2'] = new LayerMapValue(null, 2, false);
    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].overlay).to.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    // Oddly, if you print layerMap['asset2'] to console here, and also print
    // just layerMap and manually inspect ofr 'asset2', they give different
    // results (layerMap['asset2'] giving the correct results. Leaving here
    // as a warning/hint for future test issues.
    // console.log(layerMap);
    // console.log(layerMap['asset2']);

    mockOverlayMapTypes.expects('setAt').once().withArgs(
        2, new ee.MapLayerOverlay());

    toggleLayerOn(map, 'asset2');
    ee.callback('foo', null);

    mockOverlayMapTypes.verify();
    expect(layerMap['asset2'].displayed).to.equals(true);
    expect(layerMap['asset2'].overlay).to.not.be.null;
  });

  it.only('check hiden layer, then uncheck before callback', () => {
    layerMap['asset2'] = new LayerMapValue(null, 2, false);

    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].overlay).to.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(2, null);

    toggleLayerOn(map, 'asset2');
    toggleLayerOff(map, 'asset2');
    ee.callback('foo', null);

    mockOverlayMapTypes.verify();
    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].overlay).to.not.be.null;
  });
});

describe('Unit test for toggleLayerOff', () => {
  it('hides a displayed layer', () => {
    layerMap['asset0'] = new LayerMapValue(mockOverlay, 0, true);

    expect(layerMap['asset1'].displayed).to.equals(true);
    expect(layerMap['asset1'].overlay).to.not.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const map = {overlayMapTypes: overlayMapTypesApi};
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(0, null);
    toggleLayerOff(map, 'asset0');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset0'].displayed).to.equals(false);
  });
});
