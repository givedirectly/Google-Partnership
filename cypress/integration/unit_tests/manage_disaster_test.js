import {addPolygonWithPath} from '../../../docs/basic_map.js';
import {getFirestoreRoot, readDisasterDocument} from '../../../docs/firestore_document.js';
import {assetDataTemplate, createDisasterData} from '../../../docs/import/create_disaster_lib.js';
import * as ListEeAssets from '../../../docs/import/list_ee_assets.js';
import {assetSelectionRowPrefix, disasterData, initializeDamageSelector, initializeScoreSelectors, scoreAssetTypes, scoreBoundsMap, setUpScoreSelectorTable, stateAssets, validateUserFields} from '../../../docs/import/manage_disaster';
import {addDisaster, deleteDisaster, enableWhenReady, writeNewDisaster} from '../../../docs/import/manage_disaster.js';
import {createOptionFrom} from '../../../docs/import/manage_layers.js';
import {getDisaster} from '../../../docs/resources.js';
import {createAndAppend, setUpSavingStubs} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const KNOWN_STATE = 'WF';

const scoreBoundsCoordinates = [
  {lng: -95, lat: 30},
  {lng: -90, lat: 50},
  {lng: -90, lat: 30},
];

describe('Unit tests for manage_disaster.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery', 'maps');
  before(() => {
    const disasterPicker = createAndAppend('select', 'disaster-dropdown');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');
    createAndAppend('div', 'compute-status');
  });

  setUpSavingStubs();
  let createFolderStub;
  let setAclsStub;
  beforeEach(() => {
    disasterData.clear();
    createFolderStub =
        cy.stub(ee.data, 'createFolder')
            .callsFake((asset, overwrite, callback) => callback());
    setAclsStub = cy.stub(ee.data, 'setAssetAcl')
                      .callsFake((asset, acls, callback) => callback());
    // Triangle goes up into Canada, past default map of basic_map.js.
  });

  it('damage asset/map-bounds elements', () => {
    setAssetDataAndCreateDamageInputsForScoreValidationTests();
    cy.get('#map-bounds-div')
        .should('not.be.visible')
        .then(() => initializeDamageSelector(['asset1', 'asset2']));
    cy.get('#damage-asset-select').should('have.value', '');
    cy.get('#map-bounds-div').should('be.visible');
    cy.get('#damage-asset-select').select('asset2').blur();
    cy.get('#map-bounds-div').should('not.be.visible');
    readFirestoreAfterWritesFinish().then(
        (doc) => expect(doc.data()['asset_data']['damage_asset_path'])
                     .to.eql('asset2'));
  });

  const allStateAssetsMissingText =
      'Missing asset(s): Poverty, Income, SVI, Census TIGER Shapefiles, ' +
      'Microsoft Building Shapefiles';
  const allMissingText = allStateAssetsMissingText +
      ', and must specify either damage asset or map bounds';

  it('validates asset data', () => {
    setUpAssetValidationTests();
    // Check table is properly initialized, then do validation.
    cy.get('#asset-selection-table-body')
        .find('tr')
        .its('length')
        .should('eq', 5);
    // Bounds not available immediately after map initialization. Wait a tick.
    cy.wait(50).then(() => {
      // Check that map bounds have adjusted to include the polygon we
      // drew, which extends north of the US into Canada.
      // TODO(janakr): This passes even without the show/hide dance in
      //  manage_disaster#onSetDisaster, but without that it fails in
      //  production. Make test more faithful to prod somehow.
      const bounds = scoreBoundsMap.map.getBounds();
      scoreBoundsCoordinates.forEach(
          (point) => expect(bounds.contains(point)).to.be.true);
    });
    // Delete polygon to start.
    cy.stub(window, 'confirm').returns(true);

    cy.get('.score-bounds-delete-button').click().then(validateUserFields);
    // We haven't set much, so button is not enabled.
    cy.get('#process-button').should('be.disabled');
    cy.get('#process-button')
        .should('have.text', allMissingText)
        .then(
            () => addPolygonWithPath(
                scoreBoundsMap._createPolygonOptions(scoreBoundsCoordinates),
                scoreBoundsMap.drawingManager));

    cy.get('#process-button').should('have.text', allStateAssetsMissingText);
    cy.get('.score-bounds-delete-button').click();
    cy.get('#process-button').should('have.text', allMissingText);

    // Specifying the damage asset works too.
    cy.get('#damage-asset-select').select('asset2').blur();
    cy.get('#process-button').should('have.text', allStateAssetsMissingText);

    // Setting one asset has the expected effect.
    setFirstSelectInScoreRow(0);
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Income, SVI, Census TIGER Shapefiles, ' +
                'Microsoft Building Shapefiles');
    cy.get('#process-button').should('be.disabled');
    // Clear that select: back where we started.
    setFirstSelectInScoreRow(0).select('').blur();
    cy.get('#process-button').should('have.text', allStateAssetsMissingText);
    // Now set all the per-state assets.
    for (let i = 0; i < scoreAssetTypes.length; i++) {
      setFirstSelectInScoreRow(i);
    }
    // Yay! We're ready to go.
    cy.get('#process-button')
        .should('have.text', 'Kick off Data Processing (will take a while!)');
    cy.get('#process-button').should('be.enabled');
    // Get rid of damage: not ready anymore.
    cy.get('#damage-asset-select').select('').blur();
    // Message is just about damage.
    cy.get('#process-button')
        .should('have.text', 'Must specify either damage asset or map bounds');
    cy.get('#process-button').should('be.disabled');
    // Get rid of score asset.
    setFirstSelectInScoreRow(0).select('');
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty, and must specify either damage asset ' +
                'or map bounds');
    cy.get('#process-button').should('be.disabled');
    // Validate that score data was correctly written
    readFirestoreAfterWritesFinish().then((doc) => {
      const assetData = doc.data()['asset_data'];

      expect(assetData['damage_asset_path']).to.be.null;
      expect(assetData['svi_asset_paths']).to.eql({'NY': 'state2'});
      expect(assetData['snap_data']['paths']).to.eql({'NY': null});
    });
  });

  it('multistate displays properly', () => {
    setUpAssetValidationTests().then(() => {
      // Overwrite disaster data with multistate disaster.
      disasterData.set(getDisaster(), createDisasterData(['NY', 'WY']));
      stateAssets.set('WY', ['wy0', 'wy1', 'wy2', 'wy3', 'wy4']);
      initializeScoreSelectors(['NY', 'WY']);
    });
    // Check table is properly initialized, then validate.
    cy.get('#asset-selection-table-body')
        .find('tr')
        .its('length')
        .should('eq', 5)
        .then(validateUserFields);
    cy.get('#process-button').should('be.disabled');
    const allStateAssetsMissingText =
        'Missing asset(s): Poverty [NY, WY], Income [NY, WY], SVI [NY, WY], ' +
        'Census TIGER Shapefiles [NY, WY], Microsoft Building Shapefiles [NY,' +
        ' WY], and must specify either damage asset or map bounds';
    cy.get('#process-button').should('have.text', allStateAssetsMissingText);
    // Specifying one state has desired effect.
    setFirstSelectInScoreRow(0);
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty [WY], Income [NY, WY], SVI [NY, WY], ' +
                'Census TIGER Shapefiles [NY, WY], Microsoft Building ' +
                'Shapefiles [NY, WY], and must specify either damage asset ' +
                'or map bounds');
    // Specifying assets for income, both states, one type, gets rid of income
    // from message.
    setFirstSelectInScoreRow(1);
    getFirstTdInScoreRow(1).next().next().find('select').select('wy1').blur();
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty [WY], SVI [NY, WY], Census TIGER ' +
                'Shapefiles [NY, WY], Microsoft Building Shapefiles [NY, WY],' +
                ' and must specify either damage asset or map bounds');
  });

  it('nonexistent asset not ok', () => {
    const missingSnapPath = 'whereisasset';
    setUpAssetValidationTests()
        .then(() => {
          const data = createDisasterData(['NY']);
          data.asset_data.damage_asset_path = 'pathnotfound';
          data.asset_data.snap_data.paths.NY = missingSnapPath;
          disasterData.set(getDisaster(), data);
          initializeScoreSelectors(['NY']);
          initializeDamageSelector(['damage1', 'damage2']);
        })
        .then(validateUserFields);
    cy.get('#process-button').should('be.disabled');
    // Everything is missing, even though we have values stored.
    cy.get('#process-button').should('have.text', allMissingText);
    cy.get('#damage-asset-select').select('damage1');
    cy.get('#process-button').should('have.text', allStateAssetsMissingText);
    // Data wasn't actually in Firestore before, but checking that it was
    // written on a different change shows we're not silently overwriting it.
    readFirestoreAfterWritesFinish().then(
        (doc) => expect(doc.data().asset_data.snap_data.paths.NY)
                     .to.eql(missingSnapPath));
  });

  it('writes a new disaster to firestore', () => {
    let id = '2002-winter';
    const states = ['DN', 'WF'];

    writeNewDisaster(id, states)
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

    writeNewDisaster(id, states)
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

    writeNewDisaster(id, states)
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

  /**
   * Sets up fresh asset data (no feature collections), and prepares fake page
   * with damage/map-bounds-related HTML elements.
   * @return {Cypress.Chainable<Document>}
   */
  function setAssetDataAndCreateDamageInputsForScoreValidationTests() {
    // Clear out any modifications we've done to the document.
    cy.visit('test_utils/empty.html');
    cy.stub(ListEeAssets, 'getDisasterAssetsFromEe')
        .returns(Promise.resolve([]));
    const currentData = createDisasterData(['NY']);
    disasterData.set(getDisaster(), currentData);
    return cy.document().then((doc) => {
      // Lightly fake out jQuery so that we can use Cypress selectors. Might not
      // work if manage_disaster.js starts doing fancier jQuery operations.
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      const damageSelect = doc.createElement('select');
      damageSelect.id = 'damage-asset-select';
      doc.body.appendChild(damageSelect);
      const boundsDiv = doc.createElement('div');
      boundsDiv.id = 'map-bounds-div';
      boundsDiv.hidden = true;
      doc.body.appendChild(boundsDiv);
      const mapDiv = doc.createElement('div');
      boundsDiv.append(mapDiv);
      const jMapDiv = $(mapDiv);
      jMapDiv.css('width', '20%');
      jMapDiv.css('height', '20%');
      jMapDiv.prop('id', 'score-bounds-map');
      // TODO(janakr): can probably refactor this to call enableWhenReady with
      //  actual data, and test full flow.
      // Make sure scoreBoundsMap is created.
      enableWhenReady(new Promise(() => {}));
      return doc;
    });
  }

  /**
   * Sets up tests for score asset data validation beyond just damage.
   * @return {Cypress.Chainable<void>}
   */
  function setUpAssetValidationTests() {
    return setAssetDataAndCreateDamageInputsForScoreValidationTests().then(
        (doc) => {
          const tbody = doc.createElement('tbody');
          tbody.id = 'asset-selection-table-body';
          doc.body.appendChild(tbody);

          const button = doc.createElement('button');
          button.id = 'process-button';
          button.disabled = true;
          button.hidden = true;
          doc.body.appendChild(button);
          stateAssets.set(
              'NY', ['state0', 'state1', 'state2', 'state3', 'state4']);
          scoreBoundsMap.initialize(scoreBoundsCoordinates);
          // Use production code to prime score asset table, get damage set up.
          setUpScoreSelectorTable();
          initializeDamageSelector(['asset1', 'asset2']);
          initializeScoreSelectors(['NY']);
        });
  }

  /**
   * Waits for writes to finish, as tracked by `savedStub`, and then returns
   * Firestore document for current disaster.
   *
   * It might seem like there is the potential for a race here, in case the
   * Firestore write completes before we tell the stub to resolve the Promise.
   * However, Cypress will not give up control to another thread until something
   * happens, like a DOM element not being found or a call to `cy.wait` (these
   * are the primary cases, see cyqueue_test.js). So this function can be called
   * after the write has triggered, but the write will not be allowed to
   * complete until after it executes, assuming no `cy.wait` or
   * difficult-to-find element accesses were executed in the meantime.
   *
   * @return {Cypress.Chainable<Object>} Contents of Firestore document
   */
  function readFirestoreAfterWritesFinish() {
    return cy.get('@savedStub')
        .then(
            (savedStub) =>
                new Promise((resolve) => savedStub.callsFake(resolve))
                    .then(() => savedStub.resetHistory()))
        .then(readDisasterDocument);
  }
});

/**
 * Utility function to set the first select in the given score asset row. See
 * {@link getFirstTdInScoreRow}.
 * @param {number} rowNum See {@link getFirstTdInScoreRow}
 * @return {Cypress.Chainable} Cypress promise of the select
 */
function setFirstSelectInScoreRow(rowNum) {
  return getFirstTdInScoreRow(rowNum)
      .next()
      .find('select')
      .select('state' + rowNum)
      .blur();
}

/**
 * Utility function to get the first cell in a "score asset" row, like the
 * Poverty/SVI/Income/Buildings row.
 * @param {number} rowNum index of row, corresponding to its index in {@link
 *     scoreAssetTypes}
 * @return {Cypress.Chainable} Cypress promise of the td
 */
function getFirstTdInScoreRow(rowNum) {
  return cy.get('#' + assetSelectionRowPrefix + scoreAssetTypes[rowNum][0])
      .find('td')
      .first();
}
