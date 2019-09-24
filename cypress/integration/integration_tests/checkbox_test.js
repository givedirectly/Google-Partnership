import {awaitLoad} from './loading_test_util.js';

/**
 * Checks that submitting a threshold change automatically checks the score
 * checkbox (since it automatically reshows the score layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks score box', () => {
    cy.visit(host);
    awaitLoad(cy);

    cy.get('[id="score"]').uncheck();

    cy.get('[id="poverty threshold"]').type('1.0');
    cy.get('[id="update"]').click();

    awaitLoad(cy);;

    cy.get('[id="score"]').should('be.checked');
  });
});
