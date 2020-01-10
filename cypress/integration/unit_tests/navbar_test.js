import {loadNavbar} from '../../../docs/navbar.js';
import * as NavbarLib from '../../../docs/navbar_lib.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

describe('Unit test for navbar', () => {
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
  beforeEach(() => {
    cy.document().then((doc) => {
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
    });
    // This stub not working properly...
    getUrlStub = cy.stub(NavbarLib, 'getUrlUnderDocs').withArgs('navbar.html');
  });

  it('loads as privileged user', () => {
    const changeDisasterHandler = () => {};
    const firebaseDataPromise = Promise.resolve();
    const privilegedUserPromise = Promise.resolve();
    const data = {
      firebaseDataPromise,
      changeDisasterHandler,
      privilegedUserPromise,
      title: 'MY TITLE',
    };
    loadNavbar(data).then(() => {
      expect($('#nav-toggle').css('display')).to.equal('block');
      expect($('#public').css('display')).to.equal('none');
      expect(getUrlStub).to.be.calledOnce;
    });
  });
});
