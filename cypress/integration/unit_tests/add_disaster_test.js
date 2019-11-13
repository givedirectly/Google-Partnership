import {eeLegacyPathPrefix, gdEePathPrefix} from '../../../docs/ee_paths.js';
import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {addDisaster, createAssetPickers, createOptionFrom, disasters, emptyCallback, getAssetsFromEe, stateAssets, writeNewDisaster} from '../../../docs/import/add_disaster.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const KNOWN_STATE = 'WF';
const UNKNOWN_STATE = 'DN';
const KNOWN_STATE_ASSET = gdEePathPrefix + 'states/' + KNOWN_STATE + '/snap';

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();
  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));

    const disasterPicker = createAndAppend('select', 'disaster');
    disasterPicker.append(createOptionFrom('...'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.val('2003-spring');

    createAndAppend('div', 'status').hide();
  });

  beforeEach(() => {
    const listAssetsStub = cy.stub(ee.data, 'listAssets');
    listAssetsStub.withArgs(eeLegacyPathPrefix + 'states', {}, emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: gdEePathPrefix + 'states/' + KNOWN_STATE,
          }],
        }));
    listAssetsStub
        .withArgs(
            eeLegacyPathPrefix + 'states/' + KNOWN_STATE, {}, emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: gdEePathPrefix + 'states/' + KNOWN_STATE + '/snap',
          }],
        }));
    cy.stub(ee.data, 'createFolder');

    stateAssets.clear();
    // In prod this would happen in enableWhenReady which would read from
    // firestore.
    disasters.clear();
    disasters.set('2001-summer', []);
    disasters.set('2003-spring', []);
  });

  afterEach(() => {
    stateAssets.clear();
    disasters.clear();
  });

  it('gets state asset info from ee', () => {
    getAssetsFromEe([KNOWN_STATE, UNKNOWN_STATE]).then((assets) => {
      expect(assets[0]).to.eql([KNOWN_STATE, [KNOWN_STATE_ASSET]]);
      expect(assets[1]).to.eql([UNKNOWN_STATE, []]);
      expect(ee.data.listAssets)
          .to.be.calledWith(eeLegacyPathPrefix + 'states', {}, emptyCallback);
      expect(ee.data.listAssets)
          .to.be.calledWith(
              eeLegacyPathPrefix + 'states/' + KNOWN_STATE, {}, emptyCallback);
      expect(ee.data.createFolder)
          .to.be.calledWith(
              eeLegacyPathPrefix + 'states/' + UNKNOWN_STATE, false,
              emptyCallback);
    });
  });

  it('populates state asset pickers', () => {
    const assetPickers = createAndAppend('div', 'asset-pickers');
    const assets = [KNOWN_STATE, UNKNOWN_STATE];
    stateAssets.set(KNOWN_STATE, [KNOWN_STATE_ASSET]);
    stateAssets.set(UNKNOWN_STATE, []);
    createAssetPickers(assets);

    // 2 x <label> <select> <br>
    expect(assetPickers.children().length).to.equal(6);
    const picker = $('#' + KNOWN_STATE + '-adder');
    expect(picker).to.contain(
        gdEePathPrefix + 'states/' + KNOWN_STATE + '/snap');
    expect(picker.children().length).to.equal(2);
    expect($('#' + UNKNOWN_STATE + '-adder').children().length).to.equal(1);
  });

  it('writes a new disaster to firestore', () => {
    const id = '2002-winter';
    const states = ['DN, WF'];

    writeNewDisaster(id, states)
        .then((success) => {
          expect(success).to.be.true;
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
    const id = '2005-summer';
    const states = [KNOWN_STATE];

    writeNewDisaster(id, states)
        .then((success) => {
          expect(success).to.be.true;
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.false;
          const status = $('#status');
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
    const status = $('#status');

    addDisaster()
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
          expect(status.text()).to.eql('Error: disaster name must be comprised of only lowercase letters');

          year.val('2000');
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.true;
        });
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
