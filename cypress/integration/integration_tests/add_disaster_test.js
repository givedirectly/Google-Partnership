
const addDisasterUrl = host + 'import/add_disaster.html';

describe('Integration tests for add_disaster page', () => {
  it ('adds a new disaster', () => {
    cy.visit(addDisasterUrl);

    cy.get('#new-disaster').should('be.hidden');
    cy.get('#disaster').select('ADD NEW DISASTER');
    cy.get('#new-disaster').should('not.be.hidden');
    cy.get('#selected-disaster').should('be.hidden');

    cy.get('#name').type('Harry');
    cy.get('#year').type(2020);
    cy.get('#states').select(['Alaska', 'Texas']);
    cy.get('#add-disaster-button').click();

    assertHarryStatePickers();
  });

  it('attempts to add disaster with missing/bad values', () => {
    cy.visit(addDisasterUrl);

    cy.get('#disaster').select('ADD NEW DISASTER');
    cy.get('#add-disaster-button').click();
    cy.get('#status').contains('Error: Disaster name, year, and states are required.');

    cy.get('#name').type('Harry');
    cy.get('#states').select(['Alaska', 'Texas']);
    cy.get('#year').type('front'); // yeehaw
    cy.get('#add-disaster-button').click();
    cy.get('#status').contains('Error: year must be a number');
  });

  it('pulls up an already known disaster - harry', () => {
    cy.visit(addDisasterUrl);

    cy.get('#selected-disaster').should('be.hidden');
    cy.get('#disaster').select('2020-Harry');
    cy.get('#new-disaster').should('be.hidden');
    cy.get('#selected-disaster').should('not.be.hidden');

    assertHarryStatePickers();
  });
});

function assertHarryStatePickers() {
  cy.get('#disaster').should('have.value', '2020-Harry');
  // 2 x <label> <select> <br>
  cy.get('#asset-pickers').children().should('have.length', 6);

  cy.get('#TX-adder').children().should('have.length.above', 1);
  cy.get('#AK-adder').children().should('have.length', 1);
}