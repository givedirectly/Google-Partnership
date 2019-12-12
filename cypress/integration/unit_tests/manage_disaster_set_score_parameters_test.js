import {addPolygonWithPath} from '../../../docs/basic_map.js';
import {readDisasterDocument} from '../../../docs/firestore_document.js';
import {createDisasterData} from '../../../docs/import/create_disaster_lib.js';
import * as ListEeAssets from '../../../docs/import/list_ee_assets.js';
import {assetSelectionRowPrefix, disasterData, scoreAssetTypes, scoreBoundsMap, setUpScoreBoundsMap, setUpScoreSelectorTable, stateAssets, validateUserFields} from '../../../docs/import/manage_disaster';
import {enableWhenFirestoreReady} from '../../../docs/import/manage_disaster.js';
import {getDisaster} from '../../../docs/resources.js';
import {cyQueue} from '../../support/commands.js';
import {setUpSavingStubs} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

// Triangle goes up into Canada, past default map of basic_map.js.
const scoreBoundsCoordinates = [
  {lng: -95, lat: 30},
  {lng: -90, lat: 50},
  {lng: -90, lat: 30},
];

/**
 * The setup for this test is a bit problematic because the Google Maps
 * Javascript object likes to only be created once. Therefore, we can only set
 * the page up once, and then all of our tests interact with that same page.
 */
describe('Score parameters-related tests for manage_disaster.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery', 'maps');
  before(preparePage);

  setUpSavingStubs();
  let firstTest = true;
  beforeEach(() => {
    cy.document().then((doc) => {
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      if (firstTest) {
        // setUpScoreSelectorTable gets elements by id, so we have to stub
        // first, which is harder in a before() hook (since stubs should be set
        // in beforeEach() hooks) but we only want to run it once in this file.
        setUpScoreSelectorTable();
        firstTest = false;
      }
    });
    disasterData.clear();
  });

  it('damage asset/map-bounds elements', () => {
    callEnableWhenReady(setUpDefaultData());
    cy.get('#damage-asset-select').should('have.value', '');
    cy.get('#map-bounds-div').should('be.visible');
    cy.get('.score-bounds-delete-button').should('be.visible');
    cy.get('#damage-asset-select').select('asset2').blur();
    cy.get('#map-bounds-div').should('not.be.visible');
    readFirestoreAfterWritesFinish().then(
        (doc) => expect(doc.data()['asset_data']['damage_asset_path'])
                     .to.eql('asset2'));
  });

  it('no map coordinates to start', () => {
    const data = setUpDefaultData();
    data.asset_data.score_bounds_coordinates = null;
    callEnableWhenReady(data);
    cy.get('#damage-asset-select').should('have.value', '');
    cy.get('#map-bounds-div').should('be.visible');
    cy.get('.score-bounds-delete-button').should('not.be.visible');
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

  it.only('validates asset data', () => {
    const boundsChanged = new Promise((resolve) => {
      const listener = scoreBoundsMap.map.addListener('bounds_changed', () => {
        google.maps.event.removeListener(listener);
        resolve();
      });
    });
    callEnableWhenReady(setUpDefaultData());
    // Check table is properly initialized, then do validation.
    cy.get('#asset-selection-table-body')
        .find('tr')
        .its('length')
        .should('eq', 5);
    // Bounds not available immediately after map initialization. Wait a tick.
    cy.wrap(boundsChanged).then(() => {
      // Check that map bounds have adjusted to include the polygon we
      // drew, which extends north of the US into Canada.
      // TODO(janakr): This passes even without the show/hide dance of
      //  ScoreBoundsMap#initialize/onShow, but without that it fails in
      //  production. Make test more faithful to prod somehow.
      const bounds = scoreBoundsMap.map.getBounds();
      scoreBoundsCoordinates.forEach(
          (point) => expect(bounds.contains(point)).to.be.true);
    });
    // Delete polygon to start.
    cy.stub(window, 'confirm').returns(true);

    cy.get('.score-bounds-delete-button').click();
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
    stateAssets.set('WY', ['wy0', 'wy1', 'wy2', 'wy3', 'wy4']);
    setUpDefaultData();
    callEnableWhenReady(createDisasterData(['NY', 'WY']));
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
    const data = setUpDefaultData();
    data.asset_data.damage_asset_path = 'pathnotfound';
    data.asset_data.snap_data.paths.NY = missingSnapPath;
    data.asset_data.score_bounds_coordinates = null;
    callEnableWhenReady(data);
    cy.get('#process-button').should('be.disabled');
    // Everything is missing, even though we have values stored.
    cy.get('#process-button').should('have.text', allMissingText);
    cy.get('#damage-asset-select').select('asset1');
    cy.get('#process-button').should('have.text', allStateAssetsMissingText);
    // Data wasn't actually in Firestore before, but checking that it was
    // written on a different change shows we're not silently overwriting it.
    readFirestoreAfterWritesFinish().then(
        (doc) => expect(doc.data().asset_data.snap_data.paths.NY)
                     .to.eql(missingSnapPath));
  });

  /**
   * Sets up fake page. Stubs out document.getElementById, but note that this is
   * called in a `before()` hook, so the stub won't last past the first test.
   * @return {Cypress.Chainable<Document>}
   */
  function preparePage() {
    cy.visit('test_utils/empty.html');
    return cy.document().then((doc) => {
      const tbody = doc.createElement('tbody');
      tbody.id = 'asset-selection-table-body';
      doc.body.appendChild(tbody);
      const button = doc.createElement('button');
      button.id = 'process-button';
      button.disabled = true;
      button.hidden = true;
      doc.body.appendChild(button);
      const damageSelect = doc.createElement('select');
      damageSelect.id = 'damage-asset-select';
      doc.body.appendChild(damageSelect);
      const boundsDiv = doc.createElement('div');
      doc.body.appendChild(boundsDiv);
      const jBoundsDiv = $(boundsDiv);
      jBoundsDiv.prop('id', 'map-bounds-div');
      jBoundsDiv.hide();
      const mapDiv = doc.createElement('div');
      boundsDiv.append(mapDiv);
      const jMapDiv = $(mapDiv);
      jMapDiv.css('width', '20%');
      jMapDiv.css('height', '20%');
      jMapDiv.prop('id', 'score-bounds-map');
      setUpScoreBoundsMap(mapDiv);
      return doc;
    });
  }

  /**
   * Injects necessary data (stubs EE function, adds state data manually) and
   * returns default data to be passed to {@link callEnableWhenReady}.
   * @return {Object} equivalent of fetch from Firestore for a single disaster
   */
  function setUpDefaultData() {
    cy.stub(ListEeAssets, 'getDisasterAssetsFromEe')
        .returns(Promise.resolve(new Map([['asset1', 1], ['asset2', 1]])));
    const currentData = createDisasterData(['NY']);
    currentData.asset_data.score_bounds_coordinates =
        scoreBoundsCoordinates.map(
            (latlng) =>
                new firebase.firestore.GeoPoint(latlng.lat, latlng.lng));
    stateAssets.set('NY', ['state0', 'state1', 'state2', 'state3', 'state4']);
    return currentData;
  }

  /**
   * Calls {@link enableWhenFirestoreReady}, setting the current disaster's data
   * to `currentData`.
   * @param {Object} currentData Data as would have been gotten from Firestore
   * @return {Cypress.Chainable<void>}
   */
  function callEnableWhenReady(currentData) {
    return cyQueue(
        () =>
            enableWhenFirestoreReady(new Map([[getDisaster(), currentData]])));
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
