import {addPolygonWithPath} from '../../../docs/basic_map.js';
import {readDisasterDocument} from '../../../docs/firestore_document.js';
import {createDisasterData} from '../../../docs/import/create_disaster_lib.js';
import * as ListEeAssets from '../../../docs/import/list_ee_assets.js';
import {assetSelectionRowPrefix, disasterData, scoreAssetTypes, scoreBoundsMap, setUpScoreBoundsMap, setUpScoreSelectorTable, validateUserFields} from '../../../docs/import/manage_disaster';
import {enableWhenFirestoreReady} from '../../../docs/import/manage_disaster.js';
import {getDisaster} from '../../../docs/resources.js';
import {cyQueue} from '../../support/commands.js';
import {getConvertEeObjectToPromiseRelease, setUpSavingStubs} from '../../support/import_test_util.js';
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

  let stateStub;
  let disasterStub;
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
    stateStub = cy.stub(ListEeAssets, 'getStateAssetsFromEe');
    disasterStub = cy.stub(ListEeAssets, 'getDisasterAssetsFromEe')
                       .returns(Promise.resolve(new Map([
                         ['asset1', {type: 1, disabled: false}],
                         ['asset2', {type: 2, disabled: false}],
                       ])));

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
        ({assetData}) =>
            expect(assetData).has.property('damageAssetPath', 'asset2'));
  });

  it('no map coordinates to start', () => {
    const data = setUpDefaultData();
    data.assetData.scoreBoundsCoordinates = null;
    callEnableWhenReady(data);
    cy.get('#damage-asset-select').should('have.value', '');
    cy.get('#map-bounds-div').should('be.visible');
    cy.get('.score-bounds-delete-button').should('not.be.visible');
    // Wait for bounds promise to finish, and wait for the zoom level to
    // change, so that we can assert that the map has been zoomed to NY state.
    cy.wrap(Promise.all([
        scoreBoundsMap.stateBoundsPromise,
        new Promise(
            (resolve) => google.maps.event.addListenerOnce(
                scoreBoundsMap.map, 'zoom_changed', resolve)),
      ]))
        .then(() => {
          // Has NY in view after EE promise finishes and zoom
          // happens.
          expect(scoreBoundsMap.map.getBounds().contains({
            lng: -74,
            lat: 41.7,
          })).to.be.true;
          // Does not have Texas in view.
          expect(scoreBoundsMap.map.getBounds().contains({
            lng: -100,
            lat: 32,
          })).to.be.false;
        });
    cy.get('#damage-asset-select').select('asset2').blur();
    cy.get('#map-bounds-div').should('not.be.visible');
    readFirestoreAfterWritesFinish().then(
        ({assetData}) =>
            expect(assetData).has.property('damageAssetPath', 'asset2'));
  });

  const allMandatoryMissingText =
      'Missing asset(s): Poverty, Census TIGER Shapefiles';
  const alwaysOptionalMissing =
      '; warning: created asset will be missing Income, SVI';
  const allOptionalMissing = alwaysOptionalMissing + ', Building counts';
  const allStateAssetsMissingWithDamageAssetText = allMandatoryMissingText +
      ', Microsoft Building Shapefiles' + alwaysOptionalMissing;
  const allMissingText = allMandatoryMissingText +
      ', and must specify either damage asset or map bounds' +
      allOptionalMissing;

  it('has some disabled options', () => {
    disasterStub.returns(Promise.resolve(new Map([
      ['asset1', {type: 1, disabled: false}],
      ['asset2', {type: 2, disabled: true}],
    ])));
    stateStub.withArgs('NY').returns(Promise.resolve(new Map([
      ['state0', {disabled: false}],
      ['state1', {disabled: true}],
    ])));
    callEnableWhenReady(createDisasterData(['NY']));
    const stateSelector =
        cy.get('#select-asset-selection-row-poverty-NY > option');
    stateSelector.eq(2).should('be.disabled');
    stateSelector.eq(1).should('not.be.disabled');
    const disasterSelector = cy.get('#damage-asset-select > option');
    disasterSelector.eq(2).should('be.disabled');
    disasterSelector.eq(1).should('not.be.disabled');
  });

  it('Handles assets with and without geometries', () => {
    stateStub.restore();
    disasterStub.restore();
    cy.stub(ee.data, 'listAssets').returns(Promise.resolve({
      assets: [
        {id: 'asset/with/geometry', type: 'TABLE'},
        {id: 'asset/with/null/geometry', type: 'TABLE'},
        {id: 'asset/with/empty/geometry', type: 'TABLE'},
        {id: 'asset/image', type: 'IMAGE'},
      ],
    }));
    const withGeometry =
        ee.FeatureCollection([ee.Feature(ee.Geometry.Point([1, 1]), {})]);
    const withNullGeometry = ee.FeatureCollection([ee.Feature(null, {})]);
    const withEmptyGeometry =
        ee.FeatureCollection([ee.Feature(ee.Geometry.MultiPoint([]), {})]);
    const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
    featureCollectionStub.withArgs('asset/with/geometry').returns(withGeometry);
    featureCollectionStub.withArgs('asset/with/null/geometry')
        .returns(withNullGeometry);
    featureCollectionStub.withArgs('asset/with/empty/geometry')
        .returns(withEmptyGeometry);
    callEnableWhenReady(setUpDefaultData());
    for (const idStem of ['poverty', 'svi', 'income']) {
      const selector = '#select-asset-selection-row-' + idStem + '-NY > option';
      cy.get(selector).contains('None').should('be.enabled');
      cy.get(selector).contains('asset/with/geometry').should('be.enabled');
      cy.get(selector)
          .contains('asset/with/null/geometry')
          .should('be.enabled');
      cy.get(selector)
          .contains('asset/with/empty/geometry')
          .should('be.enabled');
      cy.get(selector).contains('asset/image').should('be.disabled');
    }

    // Be a little hacky to avoid repeating ourselves with damage.
    for (const idStem of ['tiger', 'buildings', 'damage']) {
      const selector = idStem === 'damage' ?
          '#damage-asset-select > option' :
          ('#select-asset-selection-row-' + idStem + '-NY > option');
      cy.get(selector).contains('None').should('be.enabled');
      cy.get(selector).contains('asset/with/geometry').should('be.enabled');
      cy.get(selector)
          .contains('asset/with/null/geometry')
          .should('be.disabled');
      cy.get(selector)
          .contains('asset/with/empty/geometry')
          .should('be.disabled');
      cy.get(selector).contains('asset/image').should('be.disabled');
    }
  });

  it('validates asset data', () => {
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
    cy.get('#process-button').should('be.disabled');
    cy.get('#process-button')
        .should('have.text', allMissingText)
        .then(
            () => addPolygonWithPath(
                scoreBoundsMap._createPolygonOptions(scoreBoundsCoordinates),
                scoreBoundsMap.drawingManager));

    cy.get('#process-button')
        .should('have.text', allMandatoryMissingText + allOptionalMissing);
    cy.get('.score-bounds-delete-button').click();
    cy.get('#process-button').should('have.text', allMissingText);

    // Specifying the damage asset works too.
    cy.get('#damage-asset-select').select('asset2').blur();
    cy.get('#process-button')
        .should('have.text', allStateAssetsMissingWithDamageAssetText);

    // Setting one asset has the expected effect.
    setFirstSelectInScoreRow(0);
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Census TIGER Shapefiles, Microsoft ' +
                'Building Shapefiles; warning: created asset will be missing ' +
                'Income, SVI');
    cy.get('#process-button').should('be.disabled');
    // Clear that select: back where we started.
    setFirstSelectInScoreRow(0).select('').blur();
    cy.get('#process-button')
        .should('have.text', allStateAssetsMissingWithDamageAssetText);
    // Now set all the per-state assets.
    for (let i = 0; i < scoreAssetTypes.length; i++) {
      setFirstSelectInScoreRow(i);
    }
    // Yay! We're ready to go.
    cy.get('#process-button')
        .should('have.text', 'Kick off Data Processing (will take a while!)');
    cy.get('#process-button')
        .should('be.enabled')
        .should('have.css', 'background-color')
        .and('eq', 'rgb(0, 128, 0)');
    // Getting rid of income keeps enabled, but warns
    setFirstSelectInScoreRow(1).select('').blur();
    cy.get('#process-button')
        .should('be.enabled')
        .should(
            'have.text',
            'Kick off Data Processing (will take a while!); warning: ' +
                'created asset will be missing Income');
    cy.get('#process-button')
        .should('have.css', 'background-color')
        .and('eq', 'rgb(150, 150, 0)');
    // Get rid of score asset.
    setFirstSelectInScoreRow(0).select('').blur();
    cy.get('#process-button')
        .should('be.disabled')
        .should('have.css', 'background-color')
        .and('eq', 'rgb(128, 128, 128)');
    // Put score asset back.
    setFirstSelectInScoreRow(0);
    // Put income back.
    setFirstSelectInScoreRow(1);
    cy.get('#process-button')
        .should('have.text', 'Kick off Data Processing (will take a while!)');
    cy.get('#process-button')
        .should('be.enabled')
        .should('have.css', 'background-color')
        .and('eq', 'rgb(0, 128, 0)');
    // Get rid of damage: not ready anymore.
    cy.get('#damage-asset-select').select('').blur();
    // Message is just about damage.
    cy.get('#process-button')
        .should('have.text', 'Must specify either damage asset or map bounds');
    cy.get('#process-button').should('be.disabled');
    // Get rid of score asset.
    setFirstSelectInScoreRow(0).select('').blur();
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty, and must specify either damage asset ' +
                'or map bounds');
    cy.get('#process-button').should('be.disabled');
    // Validate that score data was correctly written
    readFirestoreAfterWritesFinish().then(({assetData}) => {
      expect(assetData.damageAssetPath).to.be.null;
      expect(assetData.stateBasedData.sviAssetPaths).to.eql({'NY': 'state2'});
      expect(assetData.stateBasedData.snapData.paths).to.eql({'NY': null});
    });
  });

  it('multistate displays properly', () => {
    const assets = new Map();
    for (let i = 0; i <= 4; i++) {
      assets.set('wy' + i, {disabled: false});
    }
    stateStub.withArgs('WY').returns(Promise.resolve(assets));
    setUpDefaultData();
    callEnableWhenReady(createDisasterData(['NY', 'WY']));
    // Check table is properly initialized, then validate.
    cy.get('#asset-selection-table-body')
        .find('tr')
        .its('length')
        .should('eq', 5)
        .then(validateUserFields);
    cy.get('#process-button').should('be.disabled');
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty [NY, WY], Census TIGER ' +
                'Shapefiles [NY, WY], and must specify either damage asset ' +
                'or map bounds; warning: created asset will be missing Income' +
                ' [NY, WY], SVI [NY, WY], Building counts [NY, WY]');
    // Specifying one state has desired effect.
    setFirstSelectInScoreRow(0);
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty [WY], ' +
                'Census TIGER Shapefiles [NY, WY], and must specify either ' +
                'damage asset or map bounds; warning: created asset will be ' +
                'missing Income [NY, WY], SVI [NY, WY], Building counts [NY, ' +
                'WY]');
    // Specifying assets for income, both states, one type, gets rid of income
    // from message.
    setFirstSelectInScoreRow(1);
    getFirstTdInScoreRow(1).next().next().find('select').select('wy1').blur();
    cy.get('#process-button')
        .should(
            'have.text',
            'Missing asset(s): Poverty [WY], Census TIGER Shapefiles ' +
                '[NY, WY], and must specify either damage asset or map ' +
                'bounds; warning: created asset will be missing ' +
                'SVI [NY, WY], Building counts [NY, WY]');
  });

  it('nonexistent asset not ok', () => {
    const missingSnapPath = 'whereisasset';
    const data = setUpDefaultData();
    data.assetData.damageAssetPath = 'pathnotfound';
    data.assetData.stateBasedData.snapData.paths.NY = missingSnapPath;
    data.assetData.scoreBoundsCoordinates = null;
    callEnableWhenReady(data);
    cy.get('#process-button').should('be.disabled');
    // Everything is missing, even though we have values stored.
    cy.get('#process-button').should('have.text', allMissingText);
    cy.get('#damage-asset-select').select('asset1');
    cy.get('#process-button')
        .should('have.text', allStateAssetsMissingWithDamageAssetText);
    // Data wasn't actually in Firestore before, but checking that it was
    // written on a different change shows we're not silently overwriting it.
    readFirestoreAfterWritesFinish().then(
        ({assetData}) => expect(assetData.stateBasedData.snapData.paths.NY)
                             .to.eql(missingSnapPath));
  });

  it('does column verification', () => {
    callEnableWhenReady(setUpDefaultData());
    const goodIncomeBadPovertyFeature = ee.FeatureCollection(
        [ee.Feature(null, {'GEOid2': 'blah', 'HD01_VD01': 'otherBlah'})]);
    const otherGoodIncomeBadPovertyFeature = ee.FeatureCollection(
        [ee.Feature(null, {'GEOid2': 'blah', 'HD01_VD01': 'otherBlah'})]);
    const goodPovertyFeature = ee.FeatureCollection([ee.Feature(
        null,
        {'GEOid2': 0, 'GEOdisplay-label': 0, 'HD01_VD01': 0, 'HD01_VD02': 0})]);

    const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
    featureCollectionStub.withArgs('state0').returns(
        goodIncomeBadPovertyFeature);
    featureCollectionStub.withArgs('state1').returns(
        otherGoodIncomeBadPovertyFeature);
    featureCollectionStub.withArgs('state2').returns(goodPovertyFeature);

    // None -> bad
    setSelectWithDelayedEvaluate(0, 'state0', 'poverty-NY');
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset does not have all expected columns: ' +
            'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

    // bad -> bad
    setSelectWithDelayedEvaluate(0, 'state1', 'poverty-NY');
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset does not have all expected columns: ' +
            'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

    // bad -> good
    setSelectWithDelayedEvaluate(0, 'state2', 'poverty-NY');
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(0, 255, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Success! asset has all expected columns');

    // good -> bad
    setSelectWithDelayedEvaluate(0, 'state0', 'poverty-NY');
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset does not have all expected columns: ' +
            'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

    // None -> good columns
    setSelectWithDelayedEvaluate(1, 'state1', 'income-NY');
    checkSelectBorder(
        '#select-asset-selection-row-income-NY', 'rgb(0, 255, 0)');
    checkHoverText(
        '#select-asset-selection-row-income-NY',
        'Success! asset has all expected columns');

    // good -> good
    setSelectWithDelayedEvaluate(1, 'state0', 'income-NY');
    checkSelectBorder(
        '#select-asset-selection-row-income-NY', 'rgb(0, 255, 0)');
    checkHoverText(
        '#select-asset-selection-row-income-NY',
        'Success! asset has all expected columns');

    // good -> None
    // should return immediately, no release needed.
    setFirstSelectInScoreRowTo(1, 'None');
    checkSelectBorder(
        '#select-asset-selection-row-income-NY', 'rgb(255, 255, 255)');
    checkHoverText('#select-asset-selection-row-income-NY', '');

    // No expected rows
    featureCollectionStub.withArgs('state4').callsFake(
        () => goodIncomeBadPovertyFeature);
    setSelectWithDelayedEvaluate(4, 'state0', 'buildings-NY');
    checkSelectBorder(
        '#select-asset-selection-row-buildings-NY', 'rgb(0, 255, 0)');
    checkHoverText(
        '#select-asset-selection-row-buildings-NY', 'No expected columns');
    setFirstSelectInScoreRowTo(4, 'None');
    checkSelectBorder(
        '#select-asset-selection-row-buildings-NY', 'rgb(255, 255, 255)');
    checkHoverText('#select-asset-selection-row-buildings-NY', '');
  });

  it('tries to set a missing asset', () => {
    callEnableWhenReady(setUpDefaultData());
    setSelectWithDelayedEvaluate(0, 'state0', 'poverty-NY');
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset could not be found.');
  });

  it('has two racing sets on same selector', () => {
    callEnableWhenReady(setUpDefaultData());
    const goodPovertyFeature = ee.FeatureCollection([ee.Feature(
        null,
        {'GEOid2': 0, 'GEOdisplay-label': 0, 'HD01_VD01': 0, 'HD01_VD02': 0})]);
    const badPovertyFeature = ee.FeatureCollection(
        [ee.Feature(null, {'GEOid2': 'blah', 'HD01_VD01': 'otherBlah'})]);

    const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
    featureCollectionStub.withArgs('state0').returns(goodPovertyFeature);
    featureCollectionStub.withArgs('state1').returns(badPovertyFeature);

    let firstRelease;
    let firstStart;
    cyQueue(() => {
      const firstCall = getConvertEeObjectToPromiseRelease();
      firstRelease = firstCall.releaseLatch;
      firstStart = firstRelease.startPromise;
    });
    let secondRelease;
    setFirstSelectInScoreRowTo(0, 'state0')
        .then(() => firstStart)
        .then(
            () => secondRelease =
                getConvertEeObjectToPromiseRelease().releaseLatch);
    setFirstSelectInScoreRowTo(0, 'state1').then(() => firstRelease());
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 255, 0)');
    // release second evaluate and column finishes with results from second.
    checkHoverText(
        '#select-asset-selection-row-poverty-NY', 'Checking columns...')
        .then(() => secondRelease());
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset does not have all expected columns: ' +
            'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

    // now do opposite order
    cyQueue(() => {
      const firstCall = getConvertEeObjectToPromiseRelease();
      firstRelease = firstCall.releaseLatch;
      firstStart = firstCall.startPromise;
    });
    setFirstSelectInScoreRowTo(0, 'state0')
        .then(() => firstStart)
        .then(
            () => secondRelease =
                getConvertEeObjectToPromiseRelease().releaseLatch);
    setFirstSelectInScoreRowTo(0, 'state1').then(() => secondRelease());
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset does not have all expected columns: ' +
            'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01')
        .then(() => firstRelease());
    checkSelectBorder(
        '#select-asset-selection-row-poverty-NY', 'rgb(255, 0, 0)');
    checkHoverText(
        '#select-asset-selection-row-poverty-NY',
        'Error! asset does not have all expected columns: ' +
            'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');
  });

  /**
   * Sets up fake page. Called only once for this whole test file.
   * @return {Cypress.Chainable<Document>}
   */
  function preparePage() {
    cy.visit('test_utils/empty.html');
    return cy.document().then((doc) => {
      const buttonCss = doc.createElement('style');
      buttonCss.innerHTML = 'button {background-color: green;} ' +
          'button:disabled {background-color: grey}';
      doc.head.appendChild(buttonCss);
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
    const currentData = createDisasterData(['NY']);
    currentData.assetData.scoreBoundsCoordinates = scoreBoundsCoordinates.map(
        (latlng) => new firebase.firestore.GeoPoint(latlng.lat, latlng.lng));
    const assets = new Map();
    for (let i = 0; i <= 4; i++) {
      assets.set('state' + i, {disabled: false, hasGeometry: true});
    }
    stateStub.withArgs('NY').returns(Promise.resolve(assets));
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
  return setFirstSelectInScoreRowTo(rowNum, 'state' + rowNum);
}

/**
 * Utility function to get the first cell in a "score asset" row, like the
 * Poverty/SVI/Income/Buildings row.
 * @param {number} rowNum index of row, corresponding to its index in {@link
 *     scoreAssetTypes}
 * @return {Cypress.Chainable} Cypress promise of the td
 */
function getFirstTdInScoreRow(rowNum) {
  return cy.get('#' + assetSelectionRowPrefix + scoreAssetTypes[rowNum].idStem)
      .find('td')
      .first();
}

/**
 * Utility function to set the first select in the given row to the option
 * that matches the given text.
 * @param {number} rowNum
 * @param {string} text
 * @return {Cypress.Chainable} Cypress promise of the select
 */
function setFirstSelectInScoreRowTo(rowNum, text) {
  return getFirstTdInScoreRow(rowNum).next().find('select').select(text).blur();
}

/**
 * Asserts that the border around the given selector has the correct color
 * @param {string} selector cypress selector for a select element
 * @param {string} rgbString e.g. 'rgb(0, 0, 0)'
 * @return {Cypress.Chainable}
 */
function checkSelectBorder(selector, rgbString) {
  return cy.get(selector, {timeout: 5000})
      .should('have.css', 'border-color')
      .and('eq', rgbString);
}

/**
 * Asserts on the hover text for the given span.
 * @param {string} selector cypress selector for a span element
 * @param {string} text
 * @return {Cypress.Chainable}
 */
function checkHoverText(selector, text) {
  return cy.get(selector).invoke('attr', 'title').should('eq', text);
}

/**
 * Sets a select and checks that correct state exists during checking.
 * @param {number} rowNum row number of score asset selector table.
 * @param {string} text text of an option in the select identified by {@code
 *     tdId}
 * @param {string} tdId e.g. 'poverty-NY'
 */
function setSelectWithDelayedEvaluate(rowNum, text, tdId) {
  const release = getConvertEeObjectToPromiseRelease().releaseLatch;
  setFirstSelectInScoreRowTo(rowNum, text);
  checkSelectBorder('#select-asset-selection-row-' + tdId, 'rgb(255, 255, 0)');
  checkHoverText('#select-asset-selection-row-' + tdId, 'Checking columns...');
  release();
}
