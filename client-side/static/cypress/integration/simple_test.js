// Run via `yarn run cypress run`. Make sure you're using the right yarn!
describe('Integration test',() => {
  it('Opens the page', () => {
    cy.visit('http://localhost:8081/');
  })
});
