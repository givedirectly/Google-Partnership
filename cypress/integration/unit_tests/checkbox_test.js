import {layerMap, LayerMapValue, toggleLayerOff, toggleLayerOn} from '../../../client-side/static/layer_util';

const mockOverlay = {};

// layerMap['asset0'] = new LayerMapValue(mockOverlay, 0, true);
// layerMap['asset1'] = new LayerMapValue(mockOverlay, 1, false);
// layerMap['asset2'] = new LayerMapValue(null, 2, false);

describe('Unit test for toggleLayerOn', () => {
  beforeEach(() => {
    layerMap['asset0'] = new LayerMapValue(mockOverlay, 0, true);
    layerMap['asset1'] = new LayerMapValue(mockOverlay, 1, false);
    layerMap['asset2'] = new LayerMapValue(null, 2, false);
  });

  it('displays a hidden but loaded layer', () => {
    expect(layerMap['asset1'].displayed).to.equals(false);
    expect(layerMap['asset1'].data).to.not.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(1, mockOverlay);
    toggleLayerOn('asset1');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset1'].displayed).to.equals(true);
  });

  it('loads a hidden layer and displays', () => {
    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].data).to.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    // Oddly, if you print layerMap['asset2'] to console here, and also print
    // just layerMap and manually inspect it forov 'asset2', they give different
    // results (layerMap['asset2'] giving the correct results. Leaving here
    // as a warning/hint for future test issues.
    // console.log(layerMap);
    // console.log(layerMap['asset2']);

    mockOverlayMapTypes.expects('setAt').once().withArgs(
        2, new ee.MapLayerOverlay());

    toggleLayerOn('asset2');
    ee.getMapCallback('foo', null);

    mockOverlayMapTypes.verify();
    expect(layerMap['asset2'].displayed).to.equals(true);
    expect(layerMap['asset2'].data).to.not.be.null;
  });

  it('check hidden layer, then uncheck before getMapCallback', () => {
    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].data).to.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(2, null);

    toggleLayerOn('asset2');
    toggleLayerOff('asset2');
    ee.getMapCallback('foo', null);

    mockOverlayMapTypes.verify();
    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].data).to.not.be.null;
  });
});

describe('Unit test for toggleLayerOff', () => {
  it('hides a displayed layer', () => {
    expect(layerMap['asset0'].displayed).to.equals(true);
    expect(layerMap['asset0'].data).to.not.be.null;

    const overlayMapTypesApi = {
      setAt: (index, overlay) => {},
    };
    const mockOverlayMapTypes = Cypress.sinon.mock(overlayMapTypesApi);

    mockOverlayMapTypes.expects('setAt').once().withArgs(0, null);
    toggleLayerOff('asset0');
    mockOverlayMapTypes.verify();
    expect(layerMap['asset0'].displayed).to.equals(false);
  });
});
