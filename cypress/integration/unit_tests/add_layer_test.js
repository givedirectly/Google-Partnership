import {ColorStyle, LayerType} from '../../../docs/firebase_layers.js';
import {processNewEeLayer, processNonEeLayer} from '../../../docs/import/add_layer.js';
import {disasterData, getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import * as Toast from '../../../docs/toast.js';
import {createTrs} from '../../support/import_test_util.js';
import {createAndAppend, setDisasterAndLayers} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const mockAsset = 'mockAsset';

describe('Unit tests for adding layers', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  beforeEach(() => {
    const toastStub = cy.stub(Toast, 'showToastMessage');
    cy.wrap(toastStub.withArgs('Saving...', -1)).as('savingStub');
    cy.wrap(toastStub.withArgs('Saved')).as('savedStub');
    disasterData.clear();
  });

  afterEach(() => disasterData.clear());

  it('processes a new feature layer with <= 25 vals', () => {
    stubFeatureCollection(5);
    setDisasterAndLayers([{}, {}]);
    const rows = createTrs(2);
    const tbody = createAndAppend('tbody', 'tbody');
    tbody.append(rows);

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.FEATURE_COLLECTION))
        .then(() => {
          const layers = getCurrentLayers();
          expect(layers.length).to.equal(3);
          const layer = layers[2];
          expect(layer['asset-type']).to.equal(LayerType.FEATURE_COLLECTION);
          expect(layer['ee-name']).to.equal(mockAsset);
          expect(layer['display-name']).to.be.empty;
          expect(layer['display-on-load']).to.be.false;
          const colorFunction = layer['color-function'];
          expect(colorFunction['current-style']).to.equal(ColorStyle.SINGLE);
          expect(colorFunction['colors']).to.be.empty;
          const scoopsColumn = colorFunction['columns']['scoops'];
          expect(scoopsColumn['max']).to.equal(4);
          expect(scoopsColumn['min']).to.equal(0);
          expect(scoopsColumn['values']).to.eql(['0', '1', '2', '3', '4']);
          expect($('#tbody').children('tr').length).to.equal(3);
        });
  });

  it('processes a new layer with too many vals for discrete', () => {
    stubFeatureCollection(30);
    setDisasterAndLayers([]);
    createAndAppend('tbody', 'tbody');

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.FEATURE_COLLECTION))
        .then(() => {
          const layers = getCurrentLayers();
          expect(layers.length).to.equal(1);
          const layer = layers[0];
          const colorFunction = layer['color-function'];
          const scoopsColumn = colorFunction['columns']['scoops'];
          expect(scoopsColumn['max']).to.equal(29);
          expect(scoopsColumn['min']).to.equal(0);
          expect(scoopsColumn['values']).to.eql([]);
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
          const layer = getCurrentLayers()[0];
          expect(layer['color-function']['columns']['flavor']['values'])
              .to.eql(['vanilla']);
        });
  });

  it('processes a new image layer', () => {
    setDisasterAndLayers([]);
    createAndAppend('tbody', 'tbody');

    waitForPromiseAndAssertSaves(
        processNewEeLayer(mockAsset, LayerType.IMAGE_COLLECTION))
        .then(() => {
          const layers = getCurrentLayers();
          expect(layers.length).to.equal(1);
          const layer = layers[0];
          expect(layer['asset-type']).to.equal(LayerType.IMAGE_COLLECTION);
          expect(layer['color-function']).to.be.undefined;
        });
  });

  it('processes a new non-ee layer', () => {
    setDisasterAndLayers([]);
    createAndAppend('tbody', 'tbody');

    waitForPromiseAndAssertSaves(processNonEeLayer(LayerType.KML, [
      'fake-url1', 'fake-url2'
    ])).then(() => {
      const layers = getCurrentLayers();
      expect(layers.length).to.equal(1);
      const layer = layers[0];
      expect(layer['asset-type']).to.equal(LayerType.KML);
      expect(layer['color-function']).to.be.undefined;
      expect(layer['urls'].length).to.equal(2);
    });
  });
});

/**
 * @param {Promise<any>} promise
 * @return {Cypress.Chainable<void>}
 */
function waitForPromiseAndAssertSaves(promise) {
  cy.wrap(promise);
  expectStubCalledOnce('savingStub');
  return expectStubCalledOnce('savedStub');
}

/**
 * @param {string} stubName Name of stub, stored as Cypress alias
 * @return {Cypress.Chainable<void>}
 */
function expectStubCalledOnce(stubName) {
  return cy.get('@' + stubName).then((/** Sinon.SinonSpy */ stub) => {
    expect(stub).to.be.calledOnce;
    stub.resetHistory();
  });
}

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
