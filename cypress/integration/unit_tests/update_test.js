import * as ErrorLib from '../../../docs/error.js';
import * as LayerUtil from '../../../docs/layer_util.js';
import * as Run from '../../../docs/run.js';
import {setUpScoreComputationParameters} from '../../../docs/update.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

describe('Unit test for updates.js', () => {
  loadScriptsBeforeForUnitTests('firebase', 'jquery');

  before(() => global.google = {maps: {event: {clearListeners: () => {}}}});

  // creates the form div and stubs the relevant document methods.
  beforeEach(() => {
    cy.wrap(cy.stub(Run, 'createAndDisplayJoinedData')).as(
        'createAndDisplayJoinedDataStub');
    cy.wrap(cy.stub(LayerUtil, 'removeScoreLayer')).as('removeScoreLayerStub');

    cy.visit('test_utils/empty.html');
    cy.document().then((doc) => {
      const formDiv = doc.createElement('div');
      formDiv.id = 'form-div';
      doc.body.appendChild(formDiv);
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
    });
  });

  it('does not have a damage asset', () => {
    cy.wrap(setUpScoreComputationParameters(
        Promise.resolve({damageAssetPath: null}), {}));
    cy.get('input').should('have.length', 2);
    cy.get('[id="poverty threshold"]').clear().type('0.05');
    cy.get('#update').click().then(() => assertDisplayCalledWith(1, 0.3, 0));
    cy.get('#error').should('have.text', '');
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
    cy.get('#update').click().then(
        () => assertDisplayCalledWith(0.01, 0.3, 0.24));
    cy.get('#error').should('have.text', '');
  });

  it('updates toggles with errors', () => {
    const errorStub =
        cy.stub(ErrorLib, 'showError')
            .withArgs('poverty threshold must be between 0.00 and 1.00');
    setUpDamageAsset();
    cy.get('[id="poverty threshold"]').clear().type('-0.01').blur();
    cy.get('#update').click();
    cy.get('@createAndDisplayJoinedDataStub')
        .then(
            (createAndDisplayJoinedDataStub) =>
                expect(createAndDisplayJoinedDataStub).to.not.be.called);
    cy.get('@removeScoreLayerStub')
        .then(
            (removeScoreLayerStub) =>
                expect(removeScoreLayerStub).to.not.be.called);
    cy.get('#error')
        .should(
            'have.text',
            'ERROR: poverty threshold must be between 0.00 and 1.00')
        .then(() => expect(errorStub).to.be.calledOnce);
    cy.get('[id="poverty threshold"]').clear().type('0.0').blur();
    cy.get('#update').click().then(
        () => assertDisplayCalledWith(0.5, 0.0, 0.5));
    cy.get('#error').should('have.text', '');
  });

  /**
   * Checks that stub was called with the expected toggles values.
   * @param {number} povertyWeight
   * @param {number} povertyThreshold
   * @param {number} damageThreshold
   */
  function assertDisplayCalledWith(
      povertyWeight, povertyThreshold, damageThreshold) {
    cy.get('@createAndDisplayJoinedDataStub')
        .then((createAndDisplayJoinedDataStub) => {
          expect(createAndDisplayJoinedDataStub).to.be.calledOnce;
          expect(createAndDisplayJoinedDataStub)
              .to.be.calledWith(
                  {},
                  Promise.resolve(
                      {povertyWeight, povertyThreshold, damageThreshold}));
        });
    cy.get('@removeScoreLayerStub')
        .then(
            (removeScoreLayerStub) =>
                expect(removeScoreLayerStub).to.be.calledOnce);
  }
});

/**
 * Sets up as if we have a damage asset.
 * @return {Cypress.Chainable<Array<number>>}
 */
function setUpDamageAsset() {
  return cy.wrap(setUpScoreComputationParameters(
      Promise.resolve({damageAssetPath: 'foo'}), {}));
}
