import {legacyStateDir} from '../../../docs/ee_paths.js';
import * as ErrorLib from '../../../docs/error.js';
import * as FirestoreDocument from '../../../docs/firestore_document.js';
import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {deepCopy, flexibleAssetData, stateAssetDataTemplate} from '../../../docs/import/create_disaster_lib.js';
import {disasterData} from '../../../docs/import/manage_disaster';
import {addDisaster, deleteDisaster, writeNewDisaster} from '../../../docs/import/manage_disaster.js';
import {createOptionFrom} from '../../../docs/import/manage_layers.js';
import {createAndAppend} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const KNOWN_STATE = 'WF';

describe('Add/delete-related tests for manage_disaster.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  before(() => {
    const disasterPicker = createAndAppend('select', 'disaster-dropdown');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');
    createAndAppend('div', 'compute-status');
  });

  let createFolderStub;
  let setAclsStub;
  beforeEach(() => {
    disasterData.clear();
    createFolderStub = cy.stub(ee.data, 'createFolder');
    createFolderStub.callsFake((asset, overwrite, callback) => callback());
    setAclsStub = cy.stub(ee.data, 'setAssetAcl')
                      .callsFake((asset, acls, callback) => callback());
  });

  it('writes a new disaster to firestore', () => {
    let id = '2002-winter';
    const states = ['DN', 'WF'];

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          expect(createFolderStub).to.be.calledThrice;
          expect(setAclsStub).to.be.calledThrice;
          expect($('#status').is(':visible')).is.false;
          expect(disasterData.get(id).layers).to.eql([]);
          expect(disasterData.get(id).assetData.stateBasedData)
              .has.property('states', states);
          const disasterPicker = $('#disaster-dropdown');
          const options = disasterPicker.children();
          expect(options).to.have.length(3);
          expect(options.eq(1).val()).to.eql('2002-winter');
          expect(options.eq(1).is(':selected')).to.be.true;

          // boundary condition checking
          id = '1000-a';
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.true;
          expect($('#disaster-dropdown').children().eq(3).val())
              .to.eql('1000-a');

          // boundary condition checking
          id = '9999-z';
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.true;
          expect($('#disaster-dropdown').children().eq(0).val())
              .to.eql('9999-z');

          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(id)
              .get();
        })
        .then((doc) => {
          expect(doc.exists).to.be.true;
          const data = doc.data();
          const assetDataClone = deepCopy(stateAssetDataTemplate);
          assetDataClone.stateBasedData.states = states;
          expect(disasterData.get(id).layers).to.eql([]);
          const {assetData} = data;
          expect(assetData).to.eql(assetDataClone);
          // Sanity-check structure.
          expect(assetData.stateBasedData.snapData.paths).to.not.be.null;
          expect(assetData).to.have.property('damageLevelsKey', null);
        });
  });

  it('writes a flexible disaster to firestore', () => {
    cy.document().then((doc) => {
      const year = doc.createElement('input');
      doc.body.appendChild(year);
      year.id = 'year';
      const name = doc.createElement('input');
      doc.body.appendChild(name);
      name.id = 'name';
      const flexible = doc.createElement('input');
      doc.body.appendChild(flexible);
      flexible.id = 'disaster-type-flexible';
      flexible.type = 'radio';
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
    });

    cy.get('#year').type('9999');
    cy.get('#name').type('myname');
    cy.get('#disaster-type-flexible')
        .check()
        .then(addDisaster)
        .then((success) => {
          expect(success).to.be.true;
          expect(createFolderStub).to.be.calledOnce;
          expect(setAclsStub).to.be.calledOnce;
          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc('9999-myname')
              .get();
        })
        .then((doc) => {
          expect(doc.exists).to.be.true;
          const data = doc.data();
          expect(data.layers).to.eql([]);
          const {assetData} = data;
          expect(assetData).to.eql(flexibleAssetData);
          // Sanity-check structure.
          expect(assetData).to.not.have.property('stateBasedData');
          // For some reason, to.have.deep.property('flexibleData', {}) fails.
          // Seems to be fixed in Chai 4, but Cypress still on 3.5.
          expect(assetData.flexibleData).to.eql({});
          expect(assetData).to.have.property('damageAssetPath', null);
          expect(assetData).to.have.property('damageLevelsKey', null);
        });
  });

  it('tries to write a disaster id that already exists', () => {
    const id = '2005-summer';
    const states = [KNOWN_STATE];

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          expect(createFolderStub).to.be.calledTwice;
          expect(setAclsStub).to.be.calledTwice;
          createFolderStub.resetHistory();
          setAclsStub.resetHistory();
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(createFolderStub).to.not.be.called;
          expect(setAclsStub).to.not.be.called;
          const status = $('#compute-status');
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql(
                  'Error: disaster with that name and year already exists.');
        });
  });

  it('tries to write a disaster with bad info, then fixes it', () => {
    const year = createAndAppend('input', 'year');
    const name = createAndAppend('input', 'name');
    const states = createAndAppend('select', 'states');
    states.prop('multiple', 'multiple')
        .append(createSelectedOption('IG'))
        .append(createSelectedOption('MY'));
    const status = $('#compute-status');

    cy.wrap(addDisaster())
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql('Error: Disaster name and year are required.');
          expect(createFolderStub).to.not.be.called;
          expect(setAclsStub).to.not.be.called;

          year.val('hello');
          name.val('my name is');
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text()).to.eql('Error: Year must be a number.');

          year.val('2000');
          name.val('HARVEY');
          expect(createFolderStub).to.not.be.called;
          expect(setAclsStub).to.not.be.called;

          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql(
                  'Error: disaster name must be comprised of only ' +
                  'lowercase letters');

          expect(createFolderStub).to.not.be.called;
          expect(setAclsStub).to.not.be.called;
          name.val('harvey');
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.true;
          expect(createFolderStub).to.be.calledThrice;
          expect(setAclsStub).to.be.calledThrice;
        });
  });

  /**
   * Creates an option with the given text, already selected.
   * @param {string} text
   * @return {JQuery<HTMLOptionElement>}
   */
  function createSelectedOption(text) {
    return $(document.createElement('option')).val(text).prop('selected', true);
  }

  it('Error creating EE folder', () => {
    const id = '2005-summer';
    const states = [KNOWN_STATE];
    const errorStub = cy.stub(ErrorLib, 'showError');
    // Restore actual ee.createFolder. Tests don't have permission to create
    // folders, so this exercises EE failure mode better than we could fake it.
    createFolderStub.restore();
    const firestoreStub =
        cy.stub(FirestoreDocument, 'disasterCollectionReference');
    cy.wrap(writeNewDisaster(id, states)).then((success) => {
      expect(success).to.be.false;
      expect(firestoreStub).to.not.be.called;
      // https://github.com/cypress-io/cypress/issues/6072 means no ".empty" :(
      expect(disasterData).to.have.property('size', 0);
      expect(errorStub).to.be.calledOnce;
      expect(errorStub).to.be.calledWith(
          'Error creating EarthEngine folders: "Asset ' +
          '\'projects/earthengine-legacy/assets/users/gd\' does not exist or ' +
          'doesn\'t allow this operation." You can try refreshing the page');
    });
  });

  it('Tolerates already existing folder', () => {
    const id = '2005-summer';
    const states = [KNOWN_STATE];
    const errorStub = cy.stub(ErrorLib, 'showError');
    // Sadly, don't know how to get ee to actually return this error for real.
    createFolderStub
        .withArgs(legacyStateDir + KNOWN_STATE, false, Cypress.sinon.match.func)
        .callsFake((asset, overwrite, callback) => {
          callback(null, 'Cannot overwrite asset \'' + asset + '\'.');
        });
    cy.wrap(writeNewDisaster(id, states)).then((success) => {
      expect(success).to.be.true;
      expect(errorStub).to.not.be.called;
    });
  });

  it('Error writing to Firestore', () => {
    const id = '2005-summer';
    const states = [KNOWN_STATE];
    const errorStub = cy.stub(ErrorLib, 'showError');
    // Tests don't have permission to write to root Firestore, so this will
    // exercise Firestore functionality better than we could fake it.
    cy.stub(FirestoreDocument, 'disasterCollectionReference')
        .returns(firebase.firestore().collection('disaster-metadata'));
    cy.wrap(writeNewDisaster(id, states)).then((success) => {
      expect(success).to.be.false;
      // https://github.com/cypress-io/cypress/issues/6072 means no ".empty" :(
      expect(disasterData).to.have.property('size', 0);
      expect(errorStub).to.be.calledOnce;
      expect(errorStub).to.be.calledWith(
          'Error writing to Firestore: "Missing or insufficient ' +
          'permissions." You can try refreshing the page');
    });
  });

  it('deletes a disaster', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(true);

    const id = '2002-winter';
    const states = ['DN, WF'];

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(id)
              .get();
        })
        .then((doc) => {
          expect(doc.exists).to.be.true;
          const deletePromise = deleteDisaster();
          expect(confirmStub).to.be.calledOnce;
          return deletePromise;
        })
        .then(
            () => getFirestoreRoot()
                      .collection('disaster-metadata')
                      .doc(id)
                      .get())
        .then((doc) => expect(doc.exists).to.be.false);
  });
});
