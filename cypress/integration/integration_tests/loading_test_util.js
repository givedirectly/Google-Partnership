export {awaitLoad};

const LOADING_TIMEOUT = 20000;

/**
 * Awaits loading. If no divId is provided, then a full page load is awaited.
 *
 * @param {Object} cy The Cypress object.
 * @param {string[]} divIds The ids of specific divs to await loading on.
 */
function awaitLoad(cy, divIds) {
  let loaderDivs = ['#mapContainer-loader', '#tableContainer-loader'];
  if (divIds) loaderDivs = divIds.map((divId) => '#' + divId + '-loader');

  // Ensure overlays are added.
  loaderDivs.forEach((loaderDivId) => {
    cy.get(loaderDivId, {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '1');
  });

  // Ensure overlays are cleared.
  loaderDivs.forEach((loaderDivId) => {
    cy.get(loaderDivId, {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
  });
}
