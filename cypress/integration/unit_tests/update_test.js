import {disasterData, getCurrentData} from '../../../docs/import/manage_layers_lib.js';
import * as LayerUtil from '../../../docs/layer_util.js';
import * as Run from '../../../docs/run.js';
import {setUpToggles} from '../../../docs/update';
import {setUpInitialToggleValues} from '../../../docs/update.js';
import {createToggles, toggles} from '../../../docs/update.js';
import {initFirebaseForUnitTest, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

let lastPassedPovertyThreshold;
let lastPassedDamageThreshold;
let lastPassedPovertyWeight;
let createAndDisplayJoinedDataStub;
let createAndDisplayJoinedDataPromise;

describe('Unit test for updates.js', () => {
  loadScriptsBeforeForUnitTests('firebase', 'jquery');
  initFirebaseForUnitTest();

  before(() => {
    global.google = {maps: {event: {clearListeners: () => {}}}};

    const formDiv = document.createElement('div');
    formDiv.class = 'form';
    formDiv.id = 'form-div';

    document.body.appendChild(formDiv);

    const snackbarDiv = document.createElement('div');
    snackbarDiv.id = 'snackbar';
    const snackbarText = document.createElement('span');
    snackbarText.id = 'snackbar-text';
    snackbarDiv.appendChild(snackbarText);
    document.body.appendChild(snackbarDiv);
  });

  // creates the form div and stubs the relevant document methods.
  beforeEach(() => {
    // function that resolves the createAndDisplayJoinedDataPromise
    let resolvePromise;
    createAndDisplayJoinedDataPromise =
        new Promise((resolve) => resolvePromise = resolve);
    createAndDisplayJoinedDataStub =
        cy.stub(Run, 'createAndDisplayJoinedData')
            .callsFake((map, valuesPromise) => {
              valuesPromise.then((toggles) => {
                lastPassedPovertyThreshold = toggles[0];
                lastPassedDamageThreshold = toggles[1];
                lastPassedPovertyWeight = toggles[2];
                resolvePromise();
              });
            });
    cy.stub(LayerUtil, 'removeScoreLayer');

    lastPassedDamageThreshold = null;
    lastPassedPovertyThreshold = null;
    lastPassedPovertyWeight = null;

    $('#form-div').empty();
  });

  afterEach(() => $('#form-div').empty());

  it('does not have a damage asset', () => {
    const nullData = {asset_data: {damage_asset_path: null}};
    setUpToggles(Promise.resolve({data: () => nullData}), {}).then(() => {
      expect($('input').length).to.equal(3);

      document.getElementById('poverty threshold').value = .05;
      document.getElementById('update').click();

      expect(createAndDisplayJoinedDataStub).to.be.calledOnce;

      expect(toggles.get('poverty weight')).to.equals(1);
      expect(document.getElementById('error').innerHTML).to.equal('');
      cy.wrap(createAndDisplayJoinedDataPromise).then(() => {
        expect(lastPassedPovertyWeight).to.equals(1);
        expect(lastPassedDamageThreshold).to.equals(0.0);
      });
    });
  });

  it('does have a damage asset', () => {
    setUpDamageAsset().then(() => expect($('input').length).to.equal(5));
  });

  it('updates weight labels', () => {
    setUpDamageAsset().then(() => {
      const slider = document.getElementById('poverty weight');
      slider.value = 0.01;

      slider.oninput();

      expect(document.getElementById('poverty weight value').innerHTML)
          .to.equals('0.01');
      expect(document.getElementById('damage weight value').innerHTML)
          .to.equals('0.99');
    });
  });

  it('updates toggles', () => {
    setUpDamageAsset().then(() => {
      document.getElementById('poverty weight').value = 0.01;
      document.getElementById('damage threshold').value = 0.24;

      document.getElementById('update').click();
      expect(createAndDisplayJoinedDataStub).to.be.calledOnce;

      expect(toggles.get('poverty weight')).to.equals(0.01);
      expect(toggles.get('damage threshold')).to.equals(0.24);
      expect(document.getElementById('error').innerHTML).to.equal('');
      cy.wrap(createAndDisplayJoinedDataPromise).then(() => {
        expect(lastPassedPovertyWeight).to.equals(0.01);
        expect(lastPassedDamageThreshold).to.equals(0.24);
      });
    });
  });

  it('updates toggles with errors', () => {
    setUpDamageAsset().then(() => {
      document.getElementById('poverty threshold').value = -0.01;
      document.getElementById('update').click();

      expect(document.getElementById('snackbar-text').innerHTML)
          .to.equals('poverty threshold must be between 0.00 and 1.00');
      expect(document.getElementById('error').innerHTML)
          .to.equals('ERROR: poverty threshold must be between 0.00 and 1.00');
      expect(lastPassedPovertyThreshold).to.be.null;
    });
  });

  it('resets', () => {
    setUpDamageAsset().then(() => {
      toggles.set('poverty weight', 0.77);
      toggles.set('damage threshold', 0.77);

      document.getElementById('poverty weight').value = 0.01;
      document.getElementById('damage threshold').value = 0.24;

      document.getElementById('current settings').click();

      expect(document.getElementById('poverty weight value').innerHTML)
          .to.equals('0.77');
      expect(document.getElementById('damage weight value').innerHTML)
          .to.equals('0.23');
      expect(document.getElementById('damage threshold').value)
          .to.equals('0.77');
      expect(document.getElementById('poverty weight').value).to.equals('0.77');
    });
  });
});

/**
 * Sets up as if we have a damage asset.
 * @return {Promise<Array<number>>}
 */
function setUpDamageAsset() {
  const currentDisaster = '2005-fall';
  disasterData.set(currentDisaster, {asset_data: {damage_asset_path: 'foo'}});
  window.localStorage.setItem('disaster', currentDisaster);

  return setUpToggles(Promise.resolve({data: getCurrentData}), {});
}
