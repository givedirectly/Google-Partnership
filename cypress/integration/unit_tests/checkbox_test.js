import {assets, EarthEngineAsset} from '../../../docs/earth_engine_asset.js';
import {layerArray, layerMap, LayerMapValue, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from '../../../docs/layer_util';

const mockData = {};

describe('Unit test for toggleLayerOn', () => {
  beforeEach(() => {
    layerMap.set('asset0', new LayerMapValue(mockData, 0, true));
    layerMap.set('asset1', new LayerMapValue(mockData, 1, false));
    layerMap.set('asset2', new LayerMapValue(null, 2, false));
    assets['asset0'] = new EarthEngineAsset(
        EarthEngineAsset.Type.FEATURECOLLECTION, 'asset0', true);
    assets['asset1'] = new EarthEngineAsset(
        EarthEngineAsset.Type.FEATURECOLLECTION, 'asset1', false);
    assets['asset2'] = new EarthEngineAsset(
        EarthEngineAsset.Type.FEATURECOLLECTION, 'asset2', false);
    setMapToDrawLayersOn(null);
    layerArray[0] = new deck.GeoJsonLayer({});
    layerArray[1] = new deck.GeoJsonLayer({});
    ee.listEvaluateCallback = null;
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

    toggleLayerOn('asset2');
    const emptyList = [];
    ee.listEvaluateCallback(emptyList);
    // Evaluate after the promise finishes by using an instant timer.
    setTimeout(() => {
      expect(layerMap.get('asset2').displayed).to.equals(true);
      expect(layerMap.get('asset2').data).to.not.be.null;
      const layerProps = layerArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', true);
      expect(layerProps).to.have.property('data', emptyList);
    }, 0);
  });

  it('check hidden layer, then uncheck before list evaluation', () => {
    expect(layerMap.get('asset2').displayed).to.equals(false);
    expect(layerMap.get('asset2').data).to.be.null;

    toggleLayerOn('asset2');
    toggleLayerOff('asset2');
    const emptyList = [];
    ee.listEvaluateCallback(emptyList);

    // Evaluate after the promise finishes by using an instant timer.
    setTimeout(() => {
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
