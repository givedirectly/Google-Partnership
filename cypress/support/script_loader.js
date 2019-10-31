import {CLIENT_ID} from '../../docs/authenticate';

export {loadScriptsBefore};

const scriptMap = new Map([
  [
    'maps',
    [
      'https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
      () => typeof (google) !== 'undefined' &&
          typeof (google.maps) !== 'undefined',
    ],
  ],
  [
    'deck',
    [
      'https://unpkg.com/deck.gl@latest/dist.min.js',
      () => typeof (deck) !== 'undefined',
    ],
  ],
  ['ee', [host + 'lib/ee_api_js_debug.js', () => typeof (ee) !== 'undefined']],
]);

/**
 * Load genuine scripts into local document. This gives unit tests the ability
 * to use actual external objects. That makes them a bit less "unit"-y, but
 * they're still fast, and can be much more faithful to the external interfaces.
 *
 * @param {...string} scriptKeys keys from scriptMap above. These will be the
 *     scripts that are loaded.
 */
function loadScriptsBefore(...scriptKeys) {
  // Variable "parameters" is magically populated by Javascript.
  before(() => {
    const callbacks = [];
    let usesEe = false;
    for (const scriptKey of scriptKeys) {
      const scriptPair = scriptMap.get(scriptKey);
      addScriptToDocument(scriptPair[0]);
      callbacks.push(scriptPair[1]);
      usesEe |= scriptKey === 'ee';
    }
    // waitForCallback may return before the callback is actually ready, just
    // enqueuing itself to run again on a different thread, so this loop
    // finishing does not mean that all the callbacks are true. But we've done
    // our job enqueuing work that will not terminate until all the callbacks
    // are true, which will keep Cypress from proceeding until all that work is
    // done.
    for (const callback of callbacks) {
      waitForCallback(callback);
    }
    if (usesEe) {
      // We need to make sure ee has actually loaded.
      waitForCallback(scriptMap.get('ee')[1])
          .then(
              () => cy.wrap(new Promise(
                  (resolve, reject) => ee.data.setAuthToken(
                      CLIENT_ID, 'Bearer', earthEngineCustomToken,
                      // Expires in 3600 is a lie, but no need to tell the
                      // truth.
                      /* expiresIn */ 3600, /* extraScopes */[],
                      /* callback */
                      () => ee.initialize(null, null, resolve, reject),
                      /* updateAuthLibrary */ false))));
    }
  });
}

/**
 * Loads a script dynamically into Cypress's test-only "document". The script's
 * symbols will be available inside all Cypress functions, but are not available
 * during file loading, so bare statements outside of functions like
 * "const elt = deck.property" in production files will still result in errors.
 * To get around this, keep all such statements within functions that are called
 * at runtime.
 * @param {string} scriptUrl
 *     invoked after the script is added to the document to see if the desired
 *     symbol has been loaded yet. It can take a few cycles for the document to
 *     be reprocessed. The callback should normally return
 * "typeof(desiredSymbol) !== 'undefined'".
 *
 */
function addScriptToDocument(scriptUrl) {
  const script = document.createElement('script');
  script.setAttribute('src', scriptUrl);
  script.setAttribute('type', 'text/javascript');

  const headElt = document.getElementsByTagName('body');
  headElt[0].appendChild(script);
}

/**
 * Function that repeatedly calls a callback until it returns true, waiting 1 ms
 * after each failuire.
 * @param {Function} callback
 * @return {Cypress.Chainable} Cypress promise that can be chained off of
 */
function waitForCallback(callback) {
  if (!callback()) {
    return cy.wait(1).then(() => waitForCallback(callback));
  }
  // If callback is true, return a Cypress Chainable so that we can chain work
  // off of this function.
  return cy.wait(0);
}
