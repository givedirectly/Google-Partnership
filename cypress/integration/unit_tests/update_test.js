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
    cy.visit('test_utils/empty.html');
    cy.document().then((doc) => {
      const formDiv = doc.createElement('div');
      formDiv.id = 'form-div';
      doc.body.appendChild(formDiv);
      cy.stub(document, 'getElementById').callsFake(
          (id) => doc.getElementById(id));
    });
  });

  it('does not have a damage asset', () => {
    const nullData = {asset_data: {damage_asset_path: null}};
    cy.wrap(setUpToggles(Promise.resolve({data: () => nullData}), {}));
    cy.get('input').should('have.length', 2);
    cy.get('[id="poverty threshold"]').clear().type('0.05');
    cy.get('#update').click().then(() => {
      expect(createAndDisplayJoinedDataStub).to.be.calledOnce;
      expect(toggles.get('poverty weight')).to.equals(1);
    });
    cy.get('#error').should('have.text', '');
      cy.wrap(createAndDisplayJoinedDataPromise).then(() => {
        expect(lastPassedPovertyWeight).to.equals(1);
        expect(lastPassedDamageThreshold).to.equals(0.0);
      });
    });

  it('does have a damage asset', () => {
    setUpDamageAsset();
    cy.get('input').should('have.length', 4);
  });

  it('updates weight labels', () => {
    setUpDamageAsset();
    cy.get('[id="poverty weight"]').invoke('val', 0.01).trigger('input');
    cy.get('#poverty-weight-value').should('have.text', '0.01');
    cy.get('#damage-weight-value').should('have.text', '0.99');
  });

  it('updates toggles', () => {
    setUpDamageAsset();
    cy.get('[id="poverty weight"]').invoke('val', 0.01).trigger('input');
    cy.get('[id="damage threshold"]').invoke('val', 0.24).trigger('input');
    cy.get('#update').click().then(() => {
      expect(createAndDisplayJoinedDataStub).to.be.calledOnce;
      expect(toggles.get('poverty weight')).to.equals(0.01);
      expect(toggles.get('damage threshold')).to.equals(0.24);
    });
    cy.get('#error').should('have.text', '');
      cy.wrap(createAndDisplayJoinedDataPromise).then(() => {
        expect(lastPassedPovertyWeight).to.equals(0.01);
        expect(lastPassedDamageThreshold).to.equals(0.24);
      });
    });

  it.only('updates toggles with errors', () => {
    setUpDamageAsset();
    cy.get('[id="poverty weight"]').invoke('val', -0.01).trigger('input');
    cy.get('#update').click().then(() => expect(
        lastPassedPovertyThreshold).to.be.null);
    cy.get('#snackbar-text').should('have.text', 'poverty threshold must be between 0.00 and 1.00');
    cy.get('#error').should('have.text', 'ERROR: poverty threshold must be between 0.00 and 1.00');
  });
});

/**
 * Sets up as if we have a damage asset.
 * @return {Cypress.Chainable<Array<number>>}
 */
function setUpDamageAsset() {
  const currentDisaster = '2005-fall';
  disasterData.set(currentDisaster, {asset_data: {damage_asset_path: 'foo'}});
  window.localStorage.setItem('disaster', currentDisaster);
  return cy.wrap(setUpToggles(Promise.resolve({data: getCurrentData}), {}));
}
