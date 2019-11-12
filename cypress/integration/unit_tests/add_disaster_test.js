import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import * as AddDisaster from '../../../docs/import/add_disaster.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const KNOWN_STATE = 'WF';
const UNKNOWN_STATE = 'DN'; 

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();
  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));
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
          'assets':
              [{id: AddDisaster.gdEePathPrefix + 'states/' + KNOWN_STATE,}]
        ,}));
    listAssetsStub
        .withArgs(
            AddDisaster.eeLegacyPathPrefix + 'states/' + KNOWN_STATE, {},
            AddDisaster.emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: AddDisaster.gdEePathPrefix + 'states/' + KNOWN_STATE +
                '/snap',
          }]
        ,}));
    cy.stub(ee.data, 'createFolder');

    AddDisaster.createStateAssetPickers([KNOWN_STATE, UNKNOWN_STATE])
        .then(() => {
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states', {},
                  AddDisaster.emptyCallback);
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states/' + KNOWN_STATE,
                  {}, AddDisaster.emptyCallback);
          expect(ee.data.createFolder)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states/' +
                      UNKNOWN_STATE,
                  false, AddDisaster.emptyCallback);

          // 2 x <label> <select> <br>
          expect($('#asset-pickers').children().length).to.equal(6);
          // expect known state adder to contain an option for the known ee
          // asset
          const picker = $('#' + KNOWN_STATE + '-adder');
          expect(picker).to.contain(
              AddDisaster.gdEePathPrefix + 'states/' + KNOWN_STATE +
              '/snap');
          expect(picker.children().length).to.equal(2);
          expect($('#' + UNKNOWN_STATE + '-adder').children().length)
              .to.equal(1);
        });
  });

  it('writes a new disaster to firestore', () => {
    addDisasterPickerAndStatus();
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

  it.only('tries to write a disaster id that already exists', () => {
    addDisasterPickerAndStatus();

    const id = 'winter-2002';
    const states = ['DN, WF'];

    AddDisaster.writeDisaster(id, states)
        .then(() => AddDisaster.writeDisaster(id, states))
        .then(() => {
          const status = $('#status');
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql('Error: disaster with that name and year already exists.')
        });
  });
});

/** Util function for creating necessary DOM elements */
function addDisasterPickerAndStatus() {
  const disasterPicker =
      $(document.createElement('select')).attr('id', 'disaster');
  disasterPicker.append(AddDisaster.createOptionFrom('...'));
  disasterPicker.append(AddDisaster.createOptionFrom('2001-summer'));

  const selectedChild = $(AddDisaster.createOptionFrom('2003-spring'));
  disasterPicker.append(selectedChild);
  disasterPicker.val('2003-spring');

  document.body.appendChild(disasterPicker.get(0));

  const status = $(document.createElement('div')).hide().attr('id', 'status');
  document.body.appendChild(status.get(0));
}
