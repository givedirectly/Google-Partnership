import {gdEeStatePrefix, legacyStateDir, legacyStatePrefix} from '../../../docs/ee_paths.js';
import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {addDisaster, createAssetPickers, withCheckbox, createTd, createOptionFrom, withColor, deleteDisaster, disasterData, emptyCallback, getAssetsFromEe, stateAssets, writeNewDisaster} from '../../../docs/import/add_disaster.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const KNOWN_STATE = 'WF';
const UNKNOWN_STATE = 'DN';
const KNOWN_STATE_ASSET = gdEeStatePrefix + KNOWN_STATE + '/snap';

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();
  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));

    const disasterPicker = createAndAppend('select', 'disaster');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');

    createAndAppend('div', 'status').hide();
  });

  beforeEach(() => {
    const listAssetsStub = cy.stub(ee.data, 'listAssets');
    listAssetsStub.withArgs(legacyStateDir, {}, emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: gdEeStatePrefix + KNOWN_STATE,
          }],
        }));
    listAssetsStub.withArgs(legacyStatePrefix + KNOWN_STATE, {}, emptyCallback)
        .returns(Promise.resolve({
          'assets': [
            {
              id: gdEeStatePrefix + KNOWN_STATE + '/snap',
              type: 'TABLE',
            },
            {
              id: gdEeStatePrefix + KNOWN_STATE + '/folder',
              type: 'FOLDER',
            },
          ],
        }));
    cy.stub(ee.data, 'createFolder');

    stateAssets.clear();
    // In prod this would happen in enableWhenReady which would read from
    // firestore.
    disasterData.clear();
    disasterData.set('2001-summer', {});
    disasterData.set('2003-spring', {});
  });

  afterEach(() => {
    stateAssets.clear();
    disasterData.clear();
  });

  it('gets state asset info from ee', () => {
    cy.wrap(getAssetsFromEe([KNOWN_STATE, UNKNOWN_STATE])).then((assets) => {
      // tests folder type asset doesn't make it through
      expect(assets[0]).to.eql([KNOWN_STATE, [KNOWN_STATE_ASSET]]);
      expect(assets[1]).to.eql([UNKNOWN_STATE, []]);
      expect(ee.data.listAssets)
          .to.be.calledWith(legacyStateDir, {}, emptyCallback);
      expect(ee.data.listAssets)
          .to.be.calledWith(legacyStatePrefix + KNOWN_STATE, {}, emptyCallback);
      expect(ee.data.createFolder).to.be.calledOnce;
    });
  });

  it('populates state asset pickers', () => {
    const assetPickers = createAndAppend('div', 'asset-pickers');
    const assets = [KNOWN_STATE, UNKNOWN_STATE];
    stateAssets.set(KNOWN_STATE, [KNOWN_STATE_ASSET]);
    stateAssets.set(UNKNOWN_STATE, []);
    createAssetPickers(assets);

    // 2 x <label> (w/ select nested inside) <br>
    expect(assetPickers.children().length).to.equal(4);
    const known = $('#' + KNOWN_STATE + '-adder');
    expect(known).to.contain(gdEeStatePrefix + KNOWN_STATE + '/snap');
    expect(known.children().length).to.equal(1);
    expect($('#' + UNKNOWN_STATE + '-adder').children().length).to.equal(0);
  });

  it('writes a new disaster to firestore', () => {
    let id = '2002-winter';
    const states = ['DN, WF'];
    $('#disaster').hide();

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          expect($('#status').is(':visible')).to.be.false;
          const disasterPicker = $('#disaster');
          expect(disasterPicker.is(':visible')).to.be.true;
          expect($('#pending-disaster').is(':visible')).to.be.false;
          const options = disasterPicker.children();
          expect(options.length).to.eql(3);
          expect(options.eq(1).val()).to.eql('2002-winter');
          expect(options.eq(1).is(':selected')).to.be.true;

          // boundary condition checking
          id = '1000-a';
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.true;
          expect($('#disaster').children().eq(3).val()).to.eql('1000-a');

          // boundary condition checking
          id = '9999-z';
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.true;
          expect($('#disaster').children().eq(0).val()).to.eql('9999-z');

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

    cy.wrap(writeNewDisaster(id, states))
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
            () => getFirestoreRoot()
                      .collection('disaster-metadata')
                      .doc(id)
                      .get())
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

  it.only('tests color cell', () => {
    const property = 'color';

    const noColor = withColor(createTd(), {}, property, 0);
    expect(noColor.html()).to.equals('N/A');
    expect(noColor.hasClass('na')).to.be.true;

    const yellow = 'yellow';
    const singleColor = withColor(createTd(), {color: {'single-color': yellow}}, property, 0);
    console.log(singleColor.children());
    expect(singleColor.children('.box').length).to.equal(1);
    expect(singleColor.children().eq(0).css('background-color')).to.equal(yellow);

    const baseColor = withColor(createTd(), {color: {'base-color': yellow}}, property, 0);
    expect(baseColor.children('.box').length).to.equal(1);
    expect(baseColor.children().eq(0).css('background-color')).to.equal(yellow);

    const red = 'red';
    const discrete = withColor(createTd(), {color: {colors: {'squash': yellow, 'tomato': red}}}, property, 0);
    expect(discrete.children('.box').length).to.equal(2);
    expect(discrete.children().eq(1).css('background-color')).to.equal(red);

    const broken = withColor(createTd(), {color: {'broken': 'colors'}}, property, 3);
    expect(broken.children().length).to.equal(0);
    expect(broken.html()).to.be.empty;
  });

  it.only('tests checkbox cell', () => {
    const property = 'sparkling';
    const checkbox = withCheckbox(createTd(), {sparkling: false}, property)
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
