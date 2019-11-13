import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {disasters} from '../../../docs/import/add_disaster';
import * as AddDisaster from '../../../docs/import/add_disaster.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const KNOWN_STATE = 'WF';
const UNKNOWN_STATE = 'DN';

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();
  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));

    const disasterPicker = createAndAppend('select', 'disaster');
    disasterPicker.append(AddDisaster.createOptionFrom('...'));
    disasterPicker.append(AddDisaster.createOptionFrom('2001-summer'));
    disasterPicker.append(AddDisaster.createOptionFrom('2003-spring'));
    disasterPicker.val('2003-spring');

    createAndAppend('div', 'status').hide();
  });

  beforeEach(() => {
    // In prod this would happen in enableWhenReady which would read from
    // firestore.
    disasters.clear();
    disasters.set('2001-summer', []);
    disasters.set('2003-spring', []);
  });

  afterEach(() => {
    disasters.clear();
  });

  it('creates asset pickers', () => {
    const assetPickersDiv = document.createElement('div');
    assetPickersDiv.id = 'asset-pickers';
    document.body.appendChild(assetPickersDiv);

    const listAssetsStub = cy.stub(ee.data, 'listAssets');
    listAssetsStub
        .withArgs(
            AddDisaster.eeLegacyPathPrefix + 'states', {},
            AddDisaster.emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: AddDisaster.gdEePathPrefix + 'states/' + KNOWN_STATE,
          }],
        }));
    listAssetsStub
        .withArgs(
            AddDisaster.eeLegacyPathPrefix + 'states/' + KNOWN_STATE, {},
            AddDisaster.emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: AddDisaster.gdEePathPrefix + 'states/' + KNOWN_STATE + '/snap',
          }],
        }));
    cy.stub(ee.data, 'createFolder');

    AddDisaster.createStateAssetPickers([KNOWN_STATE, UNKNOWN_STATE])
        .then(() => {
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states', {},
                  AddDisaster.emptyCallback);
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states/' + KNOWN_STATE, {},
                  AddDisaster.emptyCallback);
          expect(ee.data.createFolder)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states/' + UNKNOWN_STATE,
                  false, AddDisaster.emptyCallback);

          // 2 x <label> <select> <br>
          expect($('#asset-pickers').children().length).to.equal(6);
          // expect known state adder to contain an option for the known ee
          // asset
          const picker = $('#' + KNOWN_STATE + '-adder');
          expect(picker).to.contain(
              AddDisaster.gdEePathPrefix + 'states/' + KNOWN_STATE + '/snap');
          expect(picker.children().length).to.equal(2);
          expect($('#' + UNKNOWN_STATE + '-adder').children().length)
              .to.equal(1);
        });
  });

  it('writes a new disaster to firestore', () => {
    const id = '2002-winter';
    const states = ['DN, WF'];

    AddDisaster.writeDisaster(id, states)
        .then(() => {
          expect($('#status').is(':visible')).to.be.false;
          const options = $('#disaster').children();
          expect(options.length).to.eql(4);
          expect(options.eq(2).val()).to.eql('2002-winter');
          expect(options.eq(2).is(':selected')).to.be.true;

          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(id)
              .get();
        })
        .then((doc) => {
          expect(doc.exists).to.be.true;
          expect(doc.data()['states']).to.eql(states);
        });
  });

  it('tries to write a disaster id that already exists', () => {
    const id = '2001-summer';
    const states = ['DN, WF'];

    AddDisaster.writeDisaster(id, states)
        .then(() => AddDisaster.writeDisaster(id, states))
        .then(() => {
          const status = $('#status');
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql(
                  'Error: disaster with that name and year already exists.');
        });
  });

  it('tries to write a disaster with bad info, then fixes', () => {
    const year = createAndAppend('input', 'year');
    const name = createAndAppend('input', 'name');
    const states = createAndAppend('input', 'states');
    const status = $('#status');

    AddDisaster.addDisaster();

    expect(status.is(':visible')).to.be.true;
    expect(status.text())
        .to.eql('Error: Disaster name, year, and states are required.');

    year.val('hello');
    name.val('my name is');
    states.val(['IG', 'MY']);

    AddDisaster.addDisaster();

    expect(status.is(':visible')).to.be.true;
    expect(status.text()).to.eql('Error: Year must be a number.');
  });
});

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
