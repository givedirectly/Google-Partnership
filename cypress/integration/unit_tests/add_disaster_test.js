import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import * as AddDisaster from '../../../docs/import/add_disaster.js'
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

// const addDisasterUrl = host + 'import/add_disaster.html';

const KNOWN_FAKE_STATE = 'WF';    // winterfell
const UNKNOWN_FAKE_STATE = 'DN';  // dorne

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();
  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));
    AddDisaster.setDisasterMetadata();
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
              [{id: AddDisaster.gdEePathPrefix + 'states/' + KNOWN_FAKE_STATE}]
        }));
    listAssetsStub
        .withArgs(
            AddDisaster.eeLegacyPathPrefix + 'states/' + KNOWN_FAKE_STATE, {},
            AddDisaster.emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: AddDisaster.gdEePathPrefix + 'states/' + KNOWN_FAKE_STATE +
                '/snap'
          }]
        }));
    cy.stub(ee.data, 'createFolder');

    AddDisaster.createStateAssetPickers([KNOWN_FAKE_STATE, UNKNOWN_FAKE_STATE])
        .then(() => {
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states', {},
                  AddDisaster.emptyCallback);
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states/' + KNOWN_FAKE_STATE,
                  {}, AddDisaster.emptyCallback);
          expect(ee.data.createFolder)
              .to.be.calledWith(
                  AddDisaster.eeLegacyPathPrefix + 'states/' +
                      UNKNOWN_FAKE_STATE,
                  false, AddDisaster.emptyCallback);

          // 2 x <label> <select> <br>
          expect($('#asset-pickers').children().length).to.equal(6);
          // expect known state adder to contain an option for the known ee
          // asset
          const picker = $('#' + KNOWN_FAKE_STATE + '-adder');
          expect(picker).to.contain(
              AddDisaster.gdEePathPrefix + 'states/' + KNOWN_FAKE_STATE +
              '/snap');
          expect(picker.children().length).to.equal(2);
          expect($('#' + UNKNOWN_FAKE_STATE + '-adder').children().length)
              .to.equal(1);
        });
  });

  it.only('adds a new disaster to firestore', () => {
    const disasterPicker = document.createElement('select');
    disasterPicker.id = 'disaster';
    disasterPicker.appendChild(AddDisaster.createOptionFrom('2001-summer'));
    disasterPicker.appendChild(AddDisaster.createOptionFrom('2003-spring'));

    document.body.appendChild(disasterPicker);

    const id = 'winter-2002';

    AddDisaster.writeDisaster(id, ['HG'])
        .then(
            () => {return getFirestoreRoot()
                       .collection('disaster-metadata')
                       .doc(id)
                       .get()})
        .then((doc) => {
          console.log(doc);
          expect(doc.exists).to.be.true;
          expect(doc.data()['states']).to.eql(['DN', 'WF']);
        });
  })


  //
  // it('adds a new disaster', () => {
  //   cy.visit(addDisasterUrl);
  //
  //   cy.get('#new-disaster').should('be.hidden');
  //   cy.get('#disaster').select('ADD NEW DISASTER');
  //   cy.get('#new-disaster').should('not.be.hidden');
  //   cy.get('#selected-disaster').should('be.hidden');
  //
  //   cy.get('#name').type('Harry');
  //   cy.get('#year').type(2020);
  //   cy.get('#states').select(['Alaska', 'Texas']);
  //   cy.get('#add-disaster-button').click();
  //
  //   assertHarryStatePickers();
  // });
  //
  // it('attempts to add disaster with missing/bad values', () => {
  //   cy.visit(addDisasterUrl);
  //
  //   cy.get('#disaster').select('ADD NEW DISASTER');
  //   cy.get('#add-disaster-button').click();
  //   cy.get('#status').contains(
  //       'Error: Disaster name, year, and states are required.');
  //
  //   cy.get('#name').type('Harry');
  //   cy.get('#states').select(['Alaska', 'Texas']);
  //   // yeehaw
  //   cy.get('#year').type('front');
  //   cy.get('#add-disaster-button').click();
  //   cy.get('#status').contains('Error: year must be a number');
  // });
  //
  // it('pulls up an already known disaster - harry', () => {
  //   cy.visit(addDisasterUrl);
  //
  //   cy.get('#selected-disaster').should('be.hidden');
  //   cy.get('#disaster').select('2020-Harry');
  //   cy.get('#new-disaster').should('be.hidden');
  //   cy.get('#selected-disaster').should('not.be.hidden');
  //
  //   assertHarryStatePickers();
  // });
});

/** Assert states pickers for harry are behaving.*/
function assertHarryStatePickers() {
  cy.get('#disaster').should('have.value', '2020-Harry');
  // 2 x <label> <select> <br>
  cy.get('#asset-pickers').children().should('have.length', 6);

  cy.get('#TX-adder').children().should('have.length', 2);
  cy.get('#AK-adder').children().should('have.length', 1);
}
