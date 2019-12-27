import {trackEeAndFirebase} from '../../../docs/authenticate.js';
import {eeLegacyPrefix, gdEePathPrefix} from '../../../docs/ee_paths.js';
import {cypressTestPropertyName} from '../../../docs/in_test_util.js';
import * as Resources from '../../../docs/resources.js';
import {getDisaster} from '../../../docs/resources.js';
import {getBackupScoreAssetPath} from '../../../docs/resources.js';
import {getScoreAssetPath} from '../../../docs/resources.js';
import {TaskAccumulator} from '../../../docs/task_accumulator.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

// TODO(janakr): Add more authentication unit tests here.

loadScriptsBeforeForUnitTests('ee');

/**
 * Strategy in these tests is different from most other tests. We can't hope to
 * truly use any Firebase features, since all authenticate.js does with Firebase
 * is log in. So rather than including the real libraries, we mock everything.
 */
beforeEach(() => {
  // Tell authenticate.js we're not in a test to exercise normal codepaths.
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
  const primaryPath = eeLegacyPrefix + getScoreAssetPath();
  // Avoid non-determinism of backup asset existing by making sure it does.
  cy.stub(Resources, 'getBackupScoreAssetPath')
      .returns(gdEePathPrefix + getDisaster() + '/FEMA_Damage_Assessments');
  const backupPath = eeLegacyPrefix + getBackupScoreAssetPath();
  const {
    noReadPolicy,
    privateReadPolicy,
    publicPolicy,
    publicPolicyWithReader,
  } = getPolicies();
  const getStub = cy.stub(ee.data, 'getIamPolicy');
  getStub.withArgs(primaryPath, Cypress.sinon.match.func)
      .returns(Promise.resolve(noReadPolicy))
      .withArgs(backupPath, Cypress.sinon.match.func)
      .returns(Promise.resolve(privateReadPolicy));
  const setIamStub = cy.stub(ee.data, 'setIamPolicy');
  let setPrimaryStub;
  const setPrimaryPromise = new Promise(
      (resolve) => setPrimaryStub =
          setIamStub
              .withArgs(
                  primaryPath, Cypress.sinon.match.any,
                  Cypress.sinon.match.func)
              .callsFake(resolve));
  let setBackupStub;
  const setBackupPromise = new Promise(
      (resolve) => setBackupStub =
          setIamStub
              .withArgs(
                  backupPath, Cypress.sinon.match.any, Cypress.sinon.match.func)
              .callsFake(resolve));
  waitForTrackAndAssertNormalStubs();
  cy.wrap(setPrimaryPromise).then(() => {
    expect(getStub).to.be.called;
    expect(setPrimaryStub).to.be.calledOnce;
    expect(setPrimaryStub).to.be.calledWith(primaryPath, publicPolicy);
  });
  cy.wrap(setBackupPromise).then(() => {
    expect(getStub).to.be.calledTwice;
    expect(setBackupStub).to.be.calledOnce;
    expect(setBackupStub).to.be.calledWith(backupPath, publicPolicyWithReader);
  });
});

it('Skips making readable if already readable', () => {
  const primaryPath = eeLegacyPrefix + getScoreAssetPath();
  // Avoid non-determinism of backup asset existing by making sure it doesn't.
  cy.stub(Resources, 'getBackupScoreAssetPath').returns('does/not/exist');
  const {publicPolicy} = getPolicies();

  let getResolveFunction;
  const getPromise = new Promise((resolve) => getResolveFunction = resolve);
  const getStub = cy.stub(ee.data, 'getIamPolicy').callsFake(() => {
    getResolveFunction();
    return Promise.resolve(publicPolicy);
  });
  const setIamStub = cy.stub(ee.data, 'setIamPolicy');
  waitForTrackAndAssertNormalStubs();
  cy.wrap(getPromise).then(() => {
    expect(getStub).to.be.calledOnce;
    expect(getStub).to.be.calledWith(primaryPath);
    expect(setIamStub).to.not.be.called;
  });
});

/**
 * Reaches deep into EarthEngine internals and constructs IamPolicy objects for
 * returning in {@link ee.data.getIamPolicy} stubs. Calling that method doesn't
 * seem to work in tests, even for assets we normally have write access to.
 *
 * This is so gross, but it allows us to construct genuine Policy objects so
 * that we know our code can deal with them. If names change, test will break,
 * but should be able to find new ones.
 * TODO(janakr): See what EE says about how to better construct policies.
 *
 * @return {Object} Collection of policies for use in tests
 */
function getPolicies() {
  const PolicyConstructor = module$exports$eeapiclient$ee_api_client.Policy;
  const BindingConstructor = module$exports$eeapiclient$ee_api_client.Binding;
  const ownerBinding = new BindingConstructor({
    role: 'roles/owner',
    members: ['user:gd-earthengine-user@givedirectly.org'],
  });
  const privateReaderBinding = new BindingConstructor({
    role: 'roles/viewer',
    members: ['user:gd-earthengine-user@givedirectly.org'],
  });
  const allReadWithReaderBinding = new BindingConstructor({
    role: 'roles/viewer',
    members: ['user:gd-earthengine-user@givedirectly.org', 'allUsers'],
  });
  const allReadBinding =
      new BindingConstructor({role: 'roles/viewer', members: ['allUsers']});
  return {
    noReadPolicy: new PolicyConstructor({bindings: [ownerBinding]}),
    privateReadPolicy:
        new PolicyConstructor({bindings: [ownerBinding, privateReaderBinding]}),
    publicPolicy:
        new PolicyConstructor({bindings: [ownerBinding, allReadBinding]}),
    publicPolicyWithReader: new PolicyConstructor(
        {bindings: [ownerBinding, allReadWithReaderBinding]},
        ),
  };
}

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
 * @param {*} val What stub should return
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
