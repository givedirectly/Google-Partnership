import {trackEeAndFirebase} from '../../../docs/authenticate.js';
import {eeLegacyPrefix} from '../../../docs/ee_paths.js';
import {cypressTestPropertyName} from '../../../docs/in_test_util.js';
import {getBackupScoreAssetPath} from '../../../docs/resources.js';
import {getScoreAssetPath} from '../../../docs/resources.js';
import {TaskAccumulator} from '../../../docs/task_accumulator.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

// TODO(janakr): Add more authentication unit tests here.

loadScriptsBeforeForUnitTests('ee');

beforeEach(() => {
  // Tell authenticate.js we're not in a test.
  window.localStorage.setItem(cypressTestPropertyName, '');
  const callsSecondArg = (_, callback) => callback();
  cy.wrap(cy.stub(ee.data, 'authenticateViaOauth').callsFake(callsSecondArg))
          .as('authenticateViaOAuth');
  cy.wrap(cy.stub(ee, 'initialize').callsFake((a, b, callback) => callback()))
          .as('eeInitialize');
  const emailStub = stubReturns('gd-earthengine-user@givedirectly.org');
  const profileStub = stubReturns({getEmail: emailStub});
  const getStub = stubReturns({getBasicProfile: profileStub});
  const authInstanceStub = stubReturns({currentUser: {get: getStub}});
  cy.wrap(authInstanceStub).as('gapiAuthInstance');
  cy.wrap(getStub).as('gapiGet');
  cy.wrap(profileStub).as('gapiProfile');
  cy.wrap(emailStub).as('gapiEmail');
  global.gapi = {
    load: stubCalls(callsSecondArg),
    auth2: {
      init: stubReturns(Promise.resolve()),
      getAuthInstance: authInstanceStub,
    },
  };
  global.firebase = {
    auth: () => ({onAuthStateChanged: cy.stub()}),
    initializeApp: cy.stub(),
  };
});

it('Tries to make score assets world-readable', () => {
  // Would be nice to use genuine ee.data.getIamPolicy calls, but those fail if
  // not the GD user, which is the case in tests.
  const privatePolicy = {
    bindings: [
      {
        role: 'roles/owner',
        members: ['user:gd-earthengine-user@givedirectly.org'],
      },
      {
        role: 'roles/viewer',
        members: ['user:gd-earthengine-user@givedirectly.org'],
      },
    ],
  };
  const publicPolicy = {
    bindings: [
      {
        role: 'roles/owner',
        members: ['user:gd-earthengine-user@givedirectly.org'],
      },
      {
        role: 'roles/viewer',
        members: ['user:gd-earthengine-user@givedirectly.org', 'allUsers'],
      },
    ],
  };
  const getStub = cy.stub(ee.data, 'getIamPolicy');
  getStub
      .withArgs(eeLegacyPrefix + getScoreAssetPath(), Cypress.sinon.match.func)
      .returns(Promise.resolve(privatePolicy));
  getStub
      .withArgs(
          eeLegacyPrefix + getBackupScoreAssetPath(), Cypress.sinon.match.func)
      .returns(Promise.resolve(publicPolicy));
  let setStub;
  const setPromise = new Promise(
      (resolve) => setStub =
          cy.stub(ee.data, 'setIamPolicy').callsFake(resolve));
  waitForTrackAndAssertNormalStubs();
  cy.wait(100).then(() => expect(getStub).to.be.calledTwice);
  cy.wrap(setPromise).then((result) => {
    expect(setStub).to.be.calledOnce;
    expect(setStub).to.be.calledWith(
        eeLegacyPrefix + getScoreAssetPath(), publicPolicy);
  });
});

it('Does not try to make score assets readable when not gd user', () => {
  cy.get('@gapiEmail')
      .then((emailStub) => emailStub.returns('some-user@givedirectly.org'));
  const getPolicyStub = cy.stub(ee.data, 'getIamPolicy');
  waitForTrackAndAssertNormalStubs();
  // Give other thread a chance to call listAssets if that's going to happen.
  cy.wait(0).then(() => expect(getPolicyStub).to.not.be.called);
});

/**
 * Asserts that all the library calls we expect to encounter have happened. For
 * conciseness, we use the `this` mode of accessing Cypress-aliased variables
 * (https://docs.cypress.io/guides/core-concepts/variables-and-aliases.html#Sharing-Context).
 * This means that this function cannot be called from within an arrow function.
 * @this Context
 */
function assertNormalStubsCalled() {
  expect(this.authenticateViaOAuth).to.be.calledOnce;
  expect(this.eeInitialize).to.be.calledOnce;
  expect(gapi.load).to.be.calledOnce;
  expect(gapi.auth2.init).to.be.calledOnce;
  expect(this.gapiAuthInstance).to.be.calledOnce;
  expect(this.gapiGet).to.be.calledOnce;
  expect(this.gapiProfile).to.be.calledOnce;
  expect(this.gapiEmail).to.be.calledOnce;
}

/**
 * Calls {@link trackEeAndFirebase}, waits for EE initialization to complete,
 * and makes assertions on expected stub calls.
 * @return {Cypress.Chainable<void>}
 */
function waitForTrackAndAssertNormalStubs() {
  // trackEeAndFirebase doesn't finish because mock Firebase doesn't complete.
  return cy
      .wrap(new Promise(
          (resolve) =>
              trackEeAndFirebase(new TaskAccumulator(1, resolve), false)))
      .then(assertNormalStubsCalled);
}

/**
 * Creates a {@link sinon.SinonStub} that returns `val`.
 * @param {any} val What stub should return
 * @return {sinon.SinonStub}
 */
function stubReturns(val) {
  return cy.stub().returns(val);
}

/**
 * Creates a {@link sinon.SinonStub} that calls `fake`.
 * @param {Function} fake What stub should call
 * @return {sinon.SinonStub}
 */
function stubCalls(fake) {
  return cy.stub().callsFake(fake);
}
