const LOADING_TIMEOUT = 200000;

export {cyQueue};

/**
 * Awaits loading. If no divId is provided, then a full page load is awaited.
 *
 * @param {Object} cy The Cypress object.
 * @param {string[]} divIds The ids of specific divs to await loading on.
 */
Cypress.Commands.add('awaitLoad', (divIds) => {
  let loaderDivs = ['#mapContainer-loader', '#tableContainer-loader'];
  if (divIds) loaderDivs = divIds.map((divId) => '#' + divId + '-loader');

  // Ensure overlays are added.
  loaderDivs.forEach((loaderDivId) => {
    cy.get(loaderDivId, {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity')
        .and('eq', '1');
  });

  // Ensure overlays are cleared.
  loaderDivs.forEach((loaderDivId) => {
    cy.get(loaderDivId, {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity')
        .and('eq', '0');
  });
});

/**
 * Lightly fakes out prod document access for jquery and our methods, so that we
 * can view and access the Cypress inner document as normal.
 * @return {Cypress.Chainable<HTMLDocument>} Cypress document
 */
Cypress.Commands.add('stubDocument', () => {
  return cy.document().then((doc) => {
    // cy.stub(document, 'getElementsByTagName')
    //     .callsFake((tagName) => doc.getElementsByTagName(tagName));
    cy.stub(document, 'getElementsByClassName')
        .callsFake((className) => doc.getElementsByClassName(className));
    cy.stub(document, 'getElementById')
        .callsFake((id) => doc.getElementById(id));
    cy.stub(document, 'createElement')
        .callsFake((tag) => doc.createElement(tag));
    cy.stub(document.body, 'appendChild')
        .callsFake((child) => doc.body.appendChild(child));
    return doc;
  });
});

/**
 * Cypress tests have two phases. In the first phase, each line is executed, top
 * to bottom, as usual. However, any `cy.*` commands, like `cy.get()`, do not
 * actually do anything when they execute. Instead, they enqueue a command into
 * an internal Cypress "queue". After all lines have been executed, Cypress
 * knows the full queue. At that point, the "Cypress phase" starts. Cypress
 * actually executes each command in the queue. After each command completes, it
 * will execute any `.then` blocks that were chained onto it. Thus, in the
 * following program:
 * ```
 * let resolveFunction = null;
 * const promise = new Promise((resolve) => {
 *   resolveFunction = resolve;
 *   console.log('message 0');
 * });
 * promise.then(() =>
 *     console.log(
 *         'message 8, not executed until resolveFunction() thread finishes'));
 * console.log('message 1');
 * cy.wrap(console.log('message 2')).then(() => console.log('message 6'));
 * console.log('message 3');
 * cy.wrap(console.log('message 4'))
 *     .then(() => {
 *       resolveFunction();
 *       console.log('message 7');
 *     });
 * // Will not continue in Cypress phase until promise resolves.
 * cy.wrap(promise).then(() => console.log('message 9'));
 * cy.get('#id').then(() => console.log('message 10'));
 * console.log('message 5, and promise still pending');
 * ```
 * The messages appear in the specified order.
 *
 * In the vast majority of cases, all important test instructions should be
 * executed during the Cypress phase, *not* during the initial test execution
 * phase. For the most part, that can be accomplished by chaining statements off
 * a previous Cypress command. However, for readability, it is nice to be able
 * to call functions directly, as opposed to having long chain blocks. For that
 * reason, we have this utility function, that will put the given `lambda`
 * as a `.then` block after a `cy.wrap(null)` command. That will ensure that the
 * `lambda` only executes during the Cypress phase.
 *
 * Generally, `cyQueue` is most useful as the first thing to call in another
 * function. If you have already called Cypress functions in your function, you
 * can just chain off of them, instead of calling `cyQueue`.
 *
 * As a convention in this codebase, a function that returns a {@link
 * Cypress.Chainable} can be assumed to execute its instructions during the
 * Cypress phase. Only functions that do not return a {@link Cypress.Chainable}
 * execute during the initial phase.
 *
 * For more information, see
 * https://docs.cypress.io/guides/core-concepts/introduction-to-cypress.html#Commands-Are-Asynchronous
 * @param {Function} lambda Code to be executed during Cypress phase.
 * @return {Cypress.Chainable<any>}
 */
function cyQueue(lambda) {
  return cy.wrap(null).then(lambda);
}
