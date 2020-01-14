import * as Error from '../../../docs/error.js';
import {AUTHENTICATION_ERROR_CODE} from '../../../docs/firebase_privileges';
import {loadNavbar} from '../../../docs/navbar.js';
import * as NavbarLib from '../../../docs/navbar_lib.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

loadScriptsBeforeForUnitTests('firebase', 'jquery');

before(() => {
  cy.visit('test_utils/empty.html');
  cy.document().then((doc) => {
    const navToggle = doc.createElement('div');
    navToggle.id = 'nav-toggle';
    // couldn't resist
    const hamburgerHelper = doc.createElement('a');
    hamburgerHelper.class = 'help-a';
    const hamburgerLayersLink = doc.createElement('a');
    hamburgerLayersLink.id = 'manage-layers-a';
    navToggle.append(hamburgerHelper, hamburgerLayersLink);

    const navPublic = doc.createElement('div');
    navPublic.id = 'public';
    const publicHelper = doc.createElement('a');
    publicHelper.class = 'help-a';
    // just for testing
    publicHelper.id = 'public-help';
    navPublic.append(publicHelper);

    const navHeader = doc.createElement('h1');
    navHeader.id = 'nav-title-header';
    doc.body.append(navHeader, navPublic, navToggle);
  });
});

let getUrlStub;
let errorStub;
beforeEach(() => {
  cy.document().then(
      (doc) => cy.stub(document, 'getElementById')
                   .callsFake((id) => doc.getElementById(id)));
  // This stub not working properly...
  getUrlStub = cy.stub(NavbarLib, 'getUrlUnderDocs');
  errorStub = cy.stub(Error, 'showError');
});

const changeDisasterHandler = () => {};

it('loads as privileged user', () => {
  loadNavbarWith(Promise.resolve()).then(() => {
    expect($('#nav-toggle').css('display')).to.equal('block');
    expect($('#public').css('display')).to.equal('none');
    expect(getUrlStub).to.have.callCount(5);
  });
});

it('loads as a public user',
   () => {loadNavbarWith(Promise.reject({code: AUTHENTICATION_ERROR_CODE}))
              .then(() => {
                expect($('#nav-toggle').css('display')).to.equal('none');
                expect($('#public').css('display')).to.equal('block');
                expect(getUrlStub).to.be.calledOnce;
                expect(errorStub).not.to.be.called;
              })});

it('fails privileged user promise with unexpected error', () => {
  loadNavbarWith(Promise.reject({code: 'some other code'})).then(() => {
    expect($('#nav-toggle').css('display')).to.equal('none');
    expect($('#public').css('display')).to.equal('block');
    expect(getUrlStub).to.be.calledOnce;
    expect(errorStub).to.be.calledOnce;
  });
});

it('loads as an unknown user and defaults to public',
   () => {loadNavbarWith(null).then((something) => {
     expect($('#nav-toggle').css('display')).to.equal('none');
     expect($('#public').css('display')).to.equal('block');
     expect(getUrlStub).to.be.calledOnce;
   })});

function loadNavbarWith(privilegedUserPromise) {
  return loadNavbar(
      Promise.resolve(), changeDisasterHandler, privilegedUserPromise,
      'MY TITLE')
}
