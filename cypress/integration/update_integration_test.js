const host = 'http://localhost:8080/';

describe('Integration test', () => {
  it('Checks correct initial value of poverty threshold and checks it ' +
         'updates when updated with valid value',
  () => {
       cy.visit(host);

       // Assert initial text is set to default threshold of 0.3
       cy.get('#current-threshold')
           .should('have.text', 'Current poverty threshold: 0.3');

       cy.get('#threshold').type('0.5');
       cy.get('#update-button').click();

       cy.get('#current-threshold')
           .should('have.text', 'Current poverty threshold: 0.5');
       cy.get('#threshold-error-message').should('have.text', '');
  });
});

describe('Integration test', () => {
  it('Checks for error message with bad threshold value', () => {
    cy.visit(host);

    cy.get('#update-button').click();

    cy.get('#threshold-error-message')
        .should('have.text', 'Threshold must be between 0.00 and 1.00');
  });
});

describe('Integration test', () => {
  it('Checks error message dissapears when bad threshold value ' +
         'replaced by valid value',
  () => {
       cy.visit(host);

       cy.get('#update-button').click();

       cy.get('#threshold').type('0.5');
       cy.get('#update-button').click();

       cy.get('#threshold-error-message').should('have.text', '');
  });
});
