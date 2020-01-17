import {ColorStyle, LayerType} from '../../../docs/firebase_layers.js';
import {processNewEeLayer, processNonEeLayer} from '../../../docs/import/add_layer.js';
import {disasterData, getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import {createTrs, setUpSavingStubs, waitForPromiseAndAssertSaves} from '../../support/import_test_util.js';
import {createAndAppend, setDisasterAndLayers} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const mockAsset = 'mockAsset';

describe('Unit tests for adding layers', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  setUpSavingStubs();
  let setAclStub;
  beforeEach(() => {
    disasterData.clear();
    setAclStub = cy.stub(ee.data, 'setAssetAcl');
  });

  it('processes a new feature layer with <= 25 vals', () => {
    stubFeatureCollection(5);
    setDisasterAndLayers([{}, {}]);
    const rows = createTrs(2);
    const tbody = createAndAppend('tbody', 'tbody');
    tbody.append(rows);
    createAndAppend('div', 'color-fxn-editor').hide();
    expect($('#color-fxn-editor').prop('style').display).to.equal('none');

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.FEATURE_COLLECTION))
        .then(() => {
          expect(setAclStub).to.be.calledOnce;
          const layers = getCurrentLayers();
          expect(layers.length).to.equal(3);
          const {assetType, eeName, displayName, displayOnLoad, colorFunction} =
              layers[2];
          expect(assetType).to.equal(LayerType.FEATURE_COLLECTION);
          expect(eeName).to.equal(mockAsset);
          expect(displayName).to.be.empty;
          expect(displayOnLoad).to.be.false;
          expect(colorFunction.currentStyle).to.equal(ColorStyle.SINGLE);
          expect(colorFunction.lastByPropertyStyle)
              .to.equal(ColorStyle.CONTINUOUS);
          expect(colorFunction.colors).to.be.empty;
          const scoopsColumn = colorFunction.columns.scoops;
          expect(scoopsColumn.max).to.equal(4);
          expect(scoopsColumn.min).to.equal(0);
          expect(scoopsColumn.values).to.eql(['0', '1', '2', '3', '4']);
          expect($('#tbody').children('tr').length).to.equal(3);
          expect($('#color-fxn-editor').css('display')).to.equal('block');
        });
  });

  it('processes a new layer with too many vals for discrete', () => {
    stubFeatureCollection(30);
    setDisasterAndLayers([]);
    createAndAppend('tbody', 'tbody');

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.FEATURE_COLLECTION))
        .then(() => {
          expect(setAclStub).to.be.calledOnce;
          const layers = getCurrentLayers();
          expect(layers.length).to.equal(1);
          const layer = layers[0];
          const {colorFunction} = layer;
          const scoopsColumn = colorFunction.columns.scoops;
          expect(scoopsColumn.max).to.equal(29);
          expect(scoopsColumn.min).to.equal(0);
          expect(scoopsColumn.values).to.eql([]);
        });
  });

  it('properly reduces all values of a property', () => {
    setDisasterAndLayers([]);
    const featureCollection = ee.FeatureCollection([
      ee.Feature(null, {'flavor': 'vanilla'}),
      ee.Feature(null, {'flavor': 'vanilla'}),
    ]);
    cy.stub(ee, 'FeatureCollection')
        .withArgs(mockAsset)
        .returns(featureCollection);

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.FEATURE_COLLECTION))
        .then(() => {
          expect(setAclStub).to.be.calledOnce;
          expect(getCurrentLayers()[0].colorFunction.columns.flavor.values)
              .to.eql([
                'vanilla',
              ]);
        });
  });

  it('processes a new image layer', () => {
    setDisasterAndLayers([]);
    createAndAppend('tbody', 'tbody');

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.IMAGE_COLLECTION))
        .then(() => {
          expect(setAclStub).to.be.calledOnce;
          const layers = getCurrentLayers();
          expect(layers.length).to.equal(1);
          const {assetType, colorFunction} = layers[0];
          expect(assetType).to.equal(LayerType.IMAGE_COLLECTION);
          expect(colorFunction).to.be.undefined;
        });
  });

  it('processes a new non-ee layer', () => {
    setDisasterAndLayers([]);
    createAndAppend('tbody', 'tbody');

    waitForPromiseAndAssertSaves(processNonEeLayer(LayerType.KML, [
      'fake-url1',
      'fake-url2',
    ])).then(() => {
      const layers = getCurrentLayers();
      expect(layers.length).to.equal(1);
      const {assetType, colorFunction, urls} = layers[0];
      expect(assetType).to.equal(LayerType.KML);
      expect(colorFunction).to.be.undefined;
      expect(urls.length).to.equal(2);
    });
  });
});

/**
 * Stubs ee.FeatureCollection with the given number of features
 * @param {number} numFeatures
 */
function stubFeatureCollection(numFeatures) {
  const features = [];
  for (let i = 0; i < numFeatures; i++) {
    features.push(ee.Feature(null, {'scoops': i}));
  }
  const featureCollection = ee.FeatureCollection(features);
  cy.stub(ee, 'FeatureCollection')
      .withArgs(mockAsset)
      .returns(featureCollection);
}
