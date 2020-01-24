import * as Authenticate from '../../../docs/authenticate.js';
import {getCheckBoxRowId} from '../../../docs/checkbox_util.js';
import {mapContainerId} from '../../../docs/dom_constants.js';
import * as ErrorLibrary from '../../../docs/error.js';
import * as FirestoreDocument from '../../../docs/firestore_document.js';
import {getUserFeatures} from '../../../docs/firestore_document.js';
import * as Loading from '../../../docs/loading.js';
import {initializeAndProcessUserRegions} from '../../../docs/polygon_draw.js';
import {cyQueue} from '../../support/commands.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import {createGoogleMap} from '../../support/test_map.js';

describe('Tests for polygon_draw.js with Firebase issues', () => {
  loadScriptsBeforeForUnitTests('firebase', 'jqueryWithUi', 'maps');

  let loadingStartedStub;
  let loadingFinishedStub;
  beforeEach(() => {
    loadingStartedStub =
        cy.stub(Loading, 'addLoadingElement').withArgs(mapContainerId);
    loadingFinishedStub =
        cy.stub(Loading, 'loadingElementFinished').withArgs(mapContainerId);
  });

  afterEach(() => {
    expect(loadingStartedStub).to.be.calledOnce;
    expect(loadingFinishedStub).to.be.calledOnce;
  });

  it('Unauthenticated Firestore displays error, disables row', () => {
    const errorStub =
        cy.stub(ErrorLibrary, 'showError')
            .withArgs('Viewing as public, private data not available', null);
    const signInStub = cy.stub(Authenticate, 'reloadWithSignIn');
    cy.wrap(firebase.auth().signOut());
    setUpDocumentAndReturnMap().then(
        (map) => initializeAndProcessUserRegions(
            map, Promise.resolve({scoreAssetCreationParameters: {}}),
            getUserFeatures()));
    cy.get('[title="Draw a shape"]').should('not.exist');
    cy.get('#' + getCheckBoxRowId('user-features'))
        .should('have.css', 'text-decoration')
        .and('contains', 'line-through')
        .then(() => expect(errorStub).to.be.calledOnce);
    cy.get('#' + getCheckBoxRowId('user-features')).children('input').click();
    const alertText =
        'Sign in to authorized account to view user-drawn features';
    cy.get('div').contains(alertText);
    cy.get('button').contains('Close').click();
    cy.get('div').contains(alertText).should('not.exist');
    cy.get('#' + getCheckBoxRowId('user-features')).children('label').click();
    cy.get('div').contains(alertText).then(
        () => expect(signInStub).to.not.be.called);
    cy.get('button').contains('Sign in').click().then(
        () => expect(signInStub).to.be.calledOnce);
    // If this test fails before this line, we won't reinstate Firebase login,
    // but at least in normal operation our signing out won't have caused
    // problems.
    cyQueue(() => firebase.auth().signInWithCustomToken(firestoreCustomToken));
  });

  it('Different error causes generic message', () => {
    const errorStub =
        cy.stub(ErrorLibrary, 'showError')
            .withArgs(
                Cypress.sinon.match.any,
                'Error retrieving user-drawn features. Try refreshing page');
    const error = new Error();
    error.code = 'not a code we know';
    const getFirestoreStub =
        cy.stub(FirestoreDocument, 'userFeatures').throws(error);
    setUpDocumentAndReturnMap()
        .then(
            (map) => initializeAndProcessUserRegions(
                map, Promise.resolve({scoreAssetCreationParameters: {}}),
                getUserFeatures()))
        .then(() => {
          expect(getFirestoreStub).to.be.calledOnce;
          expect(errorStub).to.be.calledOnce;
        });
    cy.get('[title="Draw a shape"]').should('not.exist');
    cy.get('#' + getCheckBoxRowId('user-features'))
        .should('have.css', 'text-decoration')
        .and('contains', 'line-through');
  });

  it('Initial Firebase error just throws', () => {
    const errorStub = cy.stub(ErrorLibrary, 'showError');
    const error = new Error('bork');
    cy.wrap(initializeAndProcessUserRegions(
                null, Promise.reject(error), getUserFeatures())
                .catch((err) => expect(err).to.equal(error)))
        .then(() => expect(errorStub).to.not.be.called);
    cy.get('[title="Draw a shape"]').should('not.exist');
  });

  /**
   * Sets up minimal document for polygon_draw initialization (Google Map and
   * div corresponding to user features checkbox). Also stubs out `document`
   * functions enough to fool jQuery.
   * @return {Cypress.Chainable<google.maps.Map>}
   */
  function setUpDocumentAndReturnMap() {
    let map;
    // Create map first, otherwise it covers the div below.
    createGoogleMap().then((mapResult) => map = mapResult);
    return cy.document().then((doc) => {
      const div = doc.createElement('div');
      div.id = getCheckBoxRowId('user-features');
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'checkbox-id';
      div.appendChild(checkbox);
      const label = doc.createElement('label');
      label.innerHTML = 'User features';
      label.htmlFor = checkbox.id;
      div.appendChild(label);
      doc.body.appendChild(div);
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      cy.stub(document.body, 'appendChild')
          .callsFake((elt) => doc.body.appendChild(elt));
      return map;
    });
  }
});
