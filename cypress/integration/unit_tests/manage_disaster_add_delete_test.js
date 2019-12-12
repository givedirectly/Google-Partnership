import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {assetDataTemplate} from '../../../docs/import/create_disaster_lib.js';
import {
  disasterData,
} from '../../../docs/import/manage_disaster';
import {
  addDisaster,
  deleteDisaster,
  writeNewDisaster
} from '../../../docs/import/manage_disaster.js';
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
    createFolderStub =
        cy.stub(ee.data, 'createFolder')
            .callsFake((asset, overwrite, callback) => callback());
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
          expect($('#status').is(':visible')).to.be.false;
          expect(disasterData.get(id)['layers']).to.eql([]);
          expect(disasterData.get(id)['states']).to.eql(states);
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
          expect(data['states']).to.eql(states);
          expect(data['layers']).to.eql([]);
          expect(data['asset_data']).to.eql(assetDataTemplate);
          // Sanity-check structure.
          expect(data['asset_data']['snap_data']['paths']).to.not.be.null;
        });
  });

  it('tries to write a disaster id that already exists', () => {
    const id = '2005-summer';
    const states = [KNOWN_STATE];

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.false;
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
    const states = createAndAppend('input', 'states');
    const status = $('#compute-status');

    cy.wrap(addDisaster())
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql('Error: Disaster name, year, and states are required.');

          year.val('hello');
          name.val('my name is');
          states.val(['IG', 'MY']);
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text()).to.eql('Error: Year must be a number.');

          year.val('2000');
          name.val('HARVEY');
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql(
                  'Error: disaster name must be comprised of only ' +
                  'lowercase letters');

          name.val('harvey');
          return addDisaster();
        })
        .then((success) => expect(success).to.be.true);
  });

  it('deletes a disaster', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(true);

    const id = '2002-winter';
    const states = ['DN, WF'];

    cy.wrap(writeNewDisaster(id, states))
        .then(
            (success) => {
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
