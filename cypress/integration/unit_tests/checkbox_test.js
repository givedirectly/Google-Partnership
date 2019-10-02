import {layerArray, layerMap, LayerMapValue, toggleLayerOff, toggleLayerOn} from '../../../client-side/static/layer_util';

const mockData = {};

// layerMap['asset0'] = new LayerMapValue(mockData, 0, true);
// layerMap['asset1'] = new LayerMapValue(mockData, 1, false);
// layerMap['asset2'] = new LayerMapValue(null, 2, false);

describe('Unit test for toggleLayerOn', () => {
  beforeEach(() => {
    layerMap['asset0'] = new LayerMapValue(mockData, 0, true);
    layerMap['asset1'] = new LayerMapValue(mockData, 1, false);
    layerMap['asset2'] = new LayerMapValue(null, 2, false);
    layerArray[0] = new deck.GeoJsonLayer({});
    layerArray[1] = new deck.GeoJsonLayer({});
  });

  it('displays a hidden but loaded layer', () => {
    expect(layerMap['asset1'].displayed).to.equals(false);
    expect(layerMap['asset1'].data).to.not.be.null;

    toggleLayerOn('asset1');
    expect(layerMap['asset1'].displayed).to.equals(true);
    const layerProps = layerArray[1].props;
    expect(layerProps).to.have.property('id', 'asset1');
    expect(layerProps).to.have.property('visible', true);
    expect(layerProps).to.have.property('data', mockData);
  });

  it('loads a hidden layer and displays', () => {
    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].data).to.be.null;


    // Oddly, if you print layerMap['asset2'] to console here, and also print
    // just layerMap and manually inspect it for 'asset2', they give different
    // results (layerMap['asset2'] giving the correct results. Leaving here
    // as a warning/hint for future test issues.
    // console.log(layerMap);
    // console.log(layerMap['asset2']);

    toggleLayerOn('asset2');
    const emptyList = [];
    ee.listEvaluateCallback(emptyList);
    expect(layerMap['asset2'].displayed).to.equals(true);
    expect(layerMap['asset2'].data).to.not.be.null;
    const layerProps = layerArray[2].props;
    expect(layerProps).to.have.property('id', 'asset2');
    expect(layerProps).to.have.property('visible', true);
    expect(layerProps).to.have.property('data', emptyList);
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
    const emptyList = [];
    ee.listEvaluateCallback(emptyList);

    expect(layerMap['asset2'].displayed).to.equals(false);
    expect(layerMap['asset2'].data).to.not.be.null;
    const layerProps = layerArray[2].props;
    expect(layerProps).to.have.property('id', 'asset2');
    expect(layerProps).to.have.property('visible', false);
    expect(layerProps).to.have.property('data', emptyList);
  });
});

describe('Unit test for toggleLayerOff', () => {
  it('hides a displayed layer', () => {
    expect(layerMap['asset0'].displayed).to.equals(true);
    expect(layerMap['asset0'].data).to.not.be.null;

    toggleLayerOff('asset0');
    expect(layerMap['asset0'].displayed).to.equals(false);
    expect(layerMap['asset0'].data).to.not.be.null;
    const layerProps = layerArray[0].props;
    expect(layerProps).to.have.property('id', 'asset0');
    expect(layerProps).to.have.property('visible', false);
    expect(layerProps).to.have.property('data', mockData);
  });
});
