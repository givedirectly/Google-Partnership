import {disasterData, getCurrentData} from '../../../docs/import/manage_layers_lib.js';
import * as LayerUtil from '../../../docs/layer_util.js';
import * as Run from '../../../docs/run.js';
import {setUpToggles, toggles} from '../../../docs/update.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

let lastPassedPovertyThreshold;
let lastPassedDamageThreshold;
let lastPassedPovertyWeight;
let createAndDisplayJoinedDataStub;
let createAndDisplayJoinedDataPromise;

describe('Unit test for updates.js', () => {
  loadScriptsBeforeForUnitTests('firebase', 'jquery');

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
            .callsFake((_, valuesPromise) => {
              valuesPromise.then((toggles) => {
                lastPassedPovertyThreshold = toggles.povertyThreshold;
                lastPassedDamageThreshold = toggles.damageThreshold;
                lastPassedPovertyWeight = toggles.povertyWeight;
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

      $('[id="poverty threshold"]').val(0.05);
      $('#update').trigger('click');

      expect(createAndDisplayJoinedDataStub).to.be.calledOnce;

      expect(toggles.get('poverty weight')).to.equals(1);
      expect($('#error').text()).to.equal('');
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
      const povertyWeight = $('[id="poverty weight"]');

      povertyWeight.val(0.01).trigger('input');

      expect($('#poverty-weight-value').text()).to.equal('0.01');
      expect($('#damage-weight-value').text()).to.equal('0.99');
    });
  });

  it('updates toggles', () => {
    setUpDamageAsset().then(() => {
      $('[id="poverty weight"]').val(0.01);
      $('[id="damage threshold"]').val(0.24);

      $('#update').trigger('click');
      expect(createAndDisplayJoinedDataStub).to.be.calledOnce;

      expect(toggles.get('poverty weight')).to.equals(0.01);
      expect(toggles.get('damage threshold')).to.equals(0.24);
      expect($('#error').text()).to.equal('');
      cy.wrap(createAndDisplayJoinedDataPromise).then(() => {
        expect(lastPassedPovertyWeight).to.equals(0.01);
        expect(lastPassedDamageThreshold).to.equals(0.24);
      });
    });
  });

  it('updates toggles with errors', () => {
    setUpDamageAsset().then(() => {
      $('[id="poverty threshold"]').val(-0.01);

      $('#update').trigger('click');

      expect($('#snackbar-text').text())
          .to.equal('poverty threshold must be between 0.00 and 1.00');
      expect($('#error').text())
          .to.equal('ERROR: poverty threshold must be between 0.00 and 1.00');
      expect(lastPassedPovertyThreshold).to.be.null;
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
