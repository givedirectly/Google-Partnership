import * as EePromiseCache from '../../docs/ee_promise_cache.js';
import {disasterData} from '../../docs/import/manage_layers_lib';
import * as Toast from '../../docs/toast.js';

export {
  createAndAppend,
  createTrs,
  getConvertEeObjectToPromiseRelease,
  setDisasterAndLayers,
  setUpSavingStubs,
  waitForPromiseAndAssertSaves,
};

/**
 * Creates some amount of table rows with a .index-td td.
 * @param {number} num
 * @return {Array<JQuery<HTMLElement>>}
 */
function createTrs(num) {
  const rows = [];
  for (let i = 0; i < num; i++) {
    rows.push(
        $(document.createElement('tr'))
            .append(
                $(document.createElement('td')).addClass('index-td').text(i)));
  }
  return rows;
}

function setHarvey() {

}

/**
 * Sets local storage to point to disaster with the given layers.
 * @param {Array<Object>} layers
 */
function setDisasterAndLayers(layers) {
  const currentDisaster = '2005-fall';
  disasterData.set(currentDisaster, {layers: layers});
  window.localStorage.setItem('disaster', currentDisaster);
}

/**
 * Utility function for creating an element and returning it wrapped as a
 * jquery object.
 * @param {string} tag
 * @param {string} id
 * @return {JQuery<HTMLElement>}
 */
function createAndAppend(tag, id) {
  const element = document.createElement(tag);
  document.body.appendChild(element);
  return $(element).attr('id', id);
}

/**
 * @param {Promise<any>} promise
 * @return {Cypress.Chainable<void>}
 */
function waitForPromiseAndAssertSaves(promise) {
  cy.wrap(promise);
  expectStubCalledOnce('savingStub');
  return expectStubCalledOnce('savedStub');
}

/**
 * @param {string} stubName Name of stub, stored as Cypress alias
 * @return {Cypress.Chainable<void>}
 */
function expectStubCalledOnce(stubName) {
  return cy.get('@' + stubName).then((/** Sinon.SinonSpy */ stub) => {
    expect(stub).to.be.calledOnce;
    stub.resetHistory();
  });
}

/**
 * Adds {@link beforeEach} hook to stub out 'Saving'/'Saved' toasts and gives
 * those stubs Cypress aliases of `@savingStub` and `@savedStub` respectively.
 */
function setUpSavingStubs() {
  beforeEach(() => {
    const toastStub = cy.stub(Toast, 'showToastMessage');
    cy.wrap(toastStub.withArgs('Saving...', -1)).as('savingStub');
    cy.wrap(toastStub.withArgs('Saved')).as('savedStub');
  });
}

/**
 * A wrapper for {@link convertEeObjectToPromise} that returns a resolve
 * function for releasing the result and a promise that resolves when the
 * convert starts. This allows us to make multiple calls to this method
 * and wait on the start promises, therefore ensuring that an instance of
 * oldConvert never points to the new promise-waiting function.
 * @return {{resolveFunction: Function, startPromise: Promise<void>}}
 */
function getConvertEeObjectToPromiseRelease() {
  let releaseLatch = null;
  const convertFinishLatch = new Promise((resolve) => releaseLatch = resolve);
  let startFunction = null;
  const startPromise = new Promise((resolve) => startFunction = resolve);
  const oldConvert = EePromiseCache.convertEeObjectToPromise;
  EePromiseCache.convertEeObjectToPromise = (eeObject) => {
    EePromiseCache.convertEeObjectToPromise = oldConvert;
    startFunction();
    return Promise
        .all([
          EePromiseCache.convertEeObjectToPromise(eeObject),
          convertFinishLatch,
        ])
        .then((results) => results[0]);
  };
  return {startPromise, releaseLatch};
}
