import {layerArray, layerMap, LayerMapValue, toggleLayerOff, toggleLayerOn} from '../../client-side/static/layer_util';

const mockData = {};

describe('Unit test for toggleLayerOn', () => {
  beforeEach(() => {
    layerMap.set('asset0', new LayerMapValue(mockData, 0, true));
    layerMap.set('asset1', new LayerMapValue(mockData, 1, false));
    layerMap.set('asset2', new LayerMapValue(null, 2, false));
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

  it('loads a hidden layer and displays', async () => {
    expect(layerMap.get('asset2').displayed).to.equals(false);
    expect(layerMap.get('asset2').data).to.be.null;

    toggleLayerOn('asset2');
    const emptyList = [];
    ee.listEvaluateCallback(emptyList);

    await executeCodeNext(() => {
      expect(layerMap.get('asset2').displayed).to.equals(true);
      expect(layerMap.get('asset2').data).to.not.be.null;
      const layerProps = layerArray[2].props;
      expect(layerProps).to.have.property('id', 'asset2');
      expect(layerProps).to.have.property('visible', true);
      expect(layerProps).to.have.property('data', emptyList);
    });
  });

  it('check hidden layer, then uncheck before list evaluation', async () => {
    expect(layerMap.get('asset2').displayed).to.equals(false);
    expect(layerMap.get('asset2').data).to.be.null;

    toggleLayerOn('asset2');
    toggleLayerOff('asset2');
    const emptyList = [];
    ee.listEvaluateCallback(emptyList);

    await executeCodeNext(() => {
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
 * Executes the code in lambda after all current pending code in the event loop.
 *
 * @param {Function} lambda
 * @returns {Promise}
 */
function executeCodeNext(lambda) {
  const settablePromise = new SettablePromise();
  // Evaluate after the current code finishes by using an instant timer.
  setTimeout(() => {
    lambda();
    settablePromise.resolve(null);
  });
  return settablePromise.get();
}

/**
 * Corresponds to Java SettableFuture class. Call this.resolve() to complete the
 * Promise successfully, and this.reject() to complete it with a failure.
 */
class SettablePromise {
  /** @constructor */
  constructor() {
    let resolveFunction = null;
    let rejectFunction = null;
    this.promise = new Promise((resolve, reject) => {
      resolveFunction = resolve;
      rejectFunction = reject;
    });
    this.resolve = resolveFunction;
    this.reject = rejectFunction;
  }

  /** Returns Promise to be resolved/rejected. */
  get() {
    return this.promise;
  }
}
