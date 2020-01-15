import {addPolygonWithPath} from '../../../docs/basic_map.js';
import * as ErrorLib from '../../../docs/error.js';
import {LayerType} from '../../../docs/firebase_layers.js';
import {readDisasterDocument} from '../../../docs/firestore_document.js';
import {BuildingSource, createDisasterData} from '../../../docs/import/create_disaster_lib.js';
import * as ListEeAssets from '../../../docs/import/list_ee_assets.js';
import {enableWhenFirestoreReady, onSetDisaster} from '../../../docs/import/manage_disaster.js';
import {DAMAGE_PROPERTY_PATH, disasterData, makeInputElementIdFromPath, NODAMAGE_COLUMN_INFO, NODAMAGE_VALUE_INFO, scoreBoundsMap, setUpScoreBoundsMap} from '../../../docs/import/manage_disaster_base.js';
import {componentsData, POVERTY_BUILDINGS_PATH, setUpFlexibleOnPageLoad} from '../../../docs/import/manage_disaster_flexible.js';
import {assetSelectionRowPrefix, setUpStateBasedOnPageLoad, stateBasedScoreAssetTypes, validateStateBasedUserFields} from '../../../docs/import/manage_disaster_state_based.js';
import * as UpdateFirestoreDisaster from '../../../docs/import/update_firestore_disaster.js';
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

const POVERTY_INDEX = 0;
const INCOME_INDEX = 1;
const SVI_INDEX = 2;
const TIGER_INDEX = 3;
const BUILDINGS_INDEX = 4;

const ENABLED_COLLECTION = {
  type: LayerType.FEATURE_COLLECTION,
  hasGeometry: true,
  disabled: false,
};

/**
 * The setup for this test is a bit problematic because the Google Maps
 * Javascript object likes to only be created once. Therefore, we can only set
 * the page up once, and then all of our tests interact with that same page.
 */

loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery', 'maps');
before(preparePage);

let stateStub;
let disasterStub;
// Reset error stub history at the end of test if it is supposed to be called.
let errorStub;
setUpSavingStubs();
let firstTest = true;
beforeEach(() => {
  cy.document().then((doc) => {
    cy.stub(document, 'getElementById')
        .callsFake((id) => doc.getElementById(id));
    if (firstTest) {
      // setUp functions get elements by id, so we have to stub first, which is
      // harder in a before() hook (since stubs should be set in beforeEach()
      // hooks) but it should only run once in this file.
      setUpStateBasedOnPageLoad();
      setUpFlexibleOnPageLoad();
      firstTest = false;
    }
  });
  stateStub = cy.stub(ListEeAssets, 'getStateAssetsFromEe');
  disasterStub = cy.stub(ListEeAssets, 'getDisasterAssetsFromEe');
  disasterStub.returns(Promise.resolve(new Map([
    ['asset1', ENABLED_COLLECTION],
    ['asset2', ENABLED_COLLECTION],
  ])));
  errorStub = cy.stub(ErrorLib, 'showError');

  disasterData.clear();
});

afterEach(() => expect(errorStub).to.not.be.called);

it('interacts with damage asset/map-bounds elements', () => {
  callEnableWhenReady(setUpDefaultData());
  getDamageSelect().should('have.value', '');
  cy.get('#map-bounds-div').should('be.visible');
  cy.get('.score-bounds-delete-button').should('be.visible');
  getDamageSelect().select('asset2').blur();
  cy.get('#map-bounds-div').should('not.be.visible');
  readFirestoreAfterWritesFinish().then(
      ({assetData}) =>
          expect(assetData).has.property('damageAssetPath', 'asset2'));
});

it('no map coordinates to start', () => {
  const data = setUpDefaultData();
  data.assetData.scoreBoundsCoordinates = null;
  callEnableWhenReady(data);
  getDamageSelect().should('have.value', '');
  cy.get('#map-bounds-div').should('be.visible');
  cy.get('.score-bounds-delete-button').should('not.be.visible');
  // Wait for bounds promise to finish, and wait for the zoom level to
  // change, so that we can assert that the map has been zoomed to NY state.
  cy.wrap(Promise.all([
      scoreBoundsMap.disasterBoundsPromise,
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
  getDamageSelect().select('asset2').blur();
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
    '; must specify either damage asset or map bounds' + allOptionalMissing;

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
      getSelectForScoreAssetIndex(POVERTY_INDEX).get('option');
  stateSelector.eq(2).should('be.disabled');
  stateSelector.eq(1).should('not.be.disabled');
  const disasterSelector = getDamageSelect().get('option');
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
  for (const index of [POVERTY_INDEX, INCOME_INDEX, SVI_INDEX]) {
    getSelectForScoreAssetIndex(index).within(() => {
      cy.get('option').contains('None').should('be.enabled');
      cy.get('option').contains('asset/with/geometry').should('be.enabled');
      cy.get('option')
          .contains('asset/with/null/geometry')
          .should('be.enabled');
      cy.get('option')
          .contains('asset/with/empty/geometry')
          .should('be.enabled');
      cy.get('option').contains('asset/image').should('be.disabled');
    });
  }

  // Be a little hacky to avoid repeating ourselves with damage.
  for (const i of [TIGER_INDEX, BUILDINGS_INDEX, BUILDINGS_INDEX + 1]) {
    (i <= BUILDINGS_INDEX ? getSelectForScoreAssetIndex(i) : getDamageSelect())
        .within(() => {
          cy.get('option').contains('None').should('be.enabled');
          cy.get('option').contains('asset/with/geometry').should('be.enabled');
          cy.get('option')
              .contains('asset/with/null/geometry')
              .should('be.disabled');
          cy.get('option')
              .contains('asset/with/empty/geometry')
              .should('be.disabled');
          cy.get('option').contains('asset/image').should('be.disabled');
        });
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
  cy.get('#kickoff-button').should('be.disabled');
  cy.get('#kickoff-button')
      .should('have.text', allMissingText)
      .then(
          () => addPolygonWithPath(
              scoreBoundsMap._createPolygonOptions(scoreBoundsCoordinates),
              scoreBoundsMap.drawingManager));

  cy.get('#kickoff-button')
      .should('have.text', allMandatoryMissingText + allOptionalMissing);
  cy.get('.score-bounds-delete-button').click();
  cy.get('#kickoff-button').should('have.text', allMissingText);

  // Specifying the damage asset works too.
  getDamageSelect().select('asset2').blur();
  cy.get('#kickoff-button')
      .should('have.text', allStateAssetsMissingWithDamageAssetText);

  // Setting one asset has the expected effect.
  setFirstSelectInScoreRow(0);
  cy.get('#kickoff-button')
      .should(
          'have.text',
          'Missing asset(s): Census TIGER Shapefiles, Microsoft ' +
              'Building Shapefiles; warning: created asset will be missing ' +
              'Income, SVI');
  cy.get('#kickoff-button').should('be.disabled');
  // Clear that select: back where we started.
  setFirstSelectInScoreRow(0).select('').blur();
  cy.get('#kickoff-button')
      .should('have.text', allStateAssetsMissingWithDamageAssetText);
  // Now set all the per-state assets.
  for (let i = 0; i < stateBasedScoreAssetTypes.length; i++) {
    setFirstSelectInScoreRow(i);
  }
  // Yay! We're ready to go.
  cy.get('#kickoff-button')
      .should(
          'have.text', 'Kick off score asset creation (will take a while!)');
  cy.get('#kickoff-button')
      .should('be.enabled')
      .should('have.css', 'background-color')
      .and('eq', 'rgb(0, 128, 0)');
  // Getting rid of income keeps enabled, but warns
  setFirstSelectInScoreRow(1).select('').blur();
  cy.get('#kickoff-button')
      .should('be.enabled')
      .should(
          'have.text',
          'Kick off score asset creation (will take a while!); warning: ' +
              'created asset will be missing Income');
  cy.get('#kickoff-button')
      .should('have.css', 'background-color')
      .and('eq', 'rgb(150, 150, 0)');
  // Get rid of score asset.
  setFirstSelectInScoreRow(0).select('').blur();
  cy.get('#kickoff-button')
      .should('be.disabled')
      .should('have.css', 'background-color')
      .and('eq', 'rgb(128, 128, 128)');
  // Put score asset back.
  setFirstSelectInScoreRow(0);
  // Put income back.
  setFirstSelectInScoreRow(1);
  cy.get('#kickoff-button')
      .should(
          'have.text', 'Kick off score asset creation (will take a while!)');
  cy.get('#kickoff-button')
      .should('be.enabled')
      .should('have.css', 'background-color')
      .and('eq', 'rgb(0, 128, 0)');
  // Get rid of damage: not ready anymore.
  getDamageSelect().select('').blur();
  // Message is just about damage.
  cy.get('#kickoff-button')
      .should('have.text', 'Must specify either damage asset or map bounds');
  cy.get('#kickoff-button').should('be.disabled');
  // Get rid of score asset.
  setFirstSelectInScoreRow(0).select('').blur();
  cy.get('#kickoff-button')
      .should(
          'have.text',
          'Missing asset(s): Poverty; must specify either damage asset or ' +
              'map bounds');
  cy.get('#kickoff-button').should('be.disabled');
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
      .then(validateStateBasedUserFields);
  cy.get('#kickoff-button').should('be.disabled');
  cy.get('#kickoff-button')
      .should(
          'have.text',
          'Missing asset(s): Poverty [NY, WY], Census TIGER ' +
              'Shapefiles [NY, WY]; must specify either damage asset ' +
              'or map bounds; warning: created asset will be missing Income' +
              ' [NY, WY], SVI [NY, WY], Building counts [NY, WY]');
  // Specifying one state has desired effect.
  setFirstSelectInScoreRow(0);
  cy.get('#kickoff-button')
      .should(
          'have.text',
          'Missing asset(s): Poverty [WY], ' +
              'Census TIGER Shapefiles [NY, WY]; must specify either ' +
              'damage asset or map bounds; warning: created asset will be ' +
              'missing Income [NY, WY], SVI [NY, WY], Building counts [NY, ' +
              'WY]');
  // Specifying assets for income, both states, one type, gets rid of income
  // from message.
  setFirstSelectInScoreRow(1);
  getFirstTdInScoreRow(1).next().next().find('select').select('wy1').blur();
  cy.get('#kickoff-button')
      .should(
          'have.text',
          'Missing asset(s): Poverty [WY], Census TIGER Shapefiles ' +
              '[NY, WY]; must specify either damage asset or map ' +
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
  cy.get('#kickoff-button').should('be.disabled');
  // Everything is missing, even though we have values stored.
  cy.get('#kickoff-button').should('have.text', allMissingText);
  getDamageSelect().select('asset1');
  cy.get('#kickoff-button')
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
  featureCollectionStub.withArgs('state0').returns(goodIncomeBadPovertyFeature);
  featureCollectionStub.withArgs('state1').returns(
      otherGoodIncomeBadPovertyFeature);
  featureCollectionStub.withArgs('state2').returns(goodPovertyFeature);

  // None -> bad
  setSelectWithDelayedEvaluate(0, 'state0', 'NY');
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(
      POVERTY_INDEX,
      'Error! asset does not have all expected columns: ' +
          'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

  // bad -> bad
  setSelectWithDelayedEvaluate(0, 'state1', 'NY');
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(
      POVERTY_INDEX,
      'Error! asset does not have all expected columns: ' +
          'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

  // bad -> good
  setSelectWithDelayedEvaluate(0, 'state2', 'NY');
  checkSelectBorder(POVERTY_INDEX, 'rgb(0, 255, 0)');
  checkHoverText(POVERTY_INDEX, 'Success! asset has all expected columns');

  // good -> bad
  setSelectWithDelayedEvaluate(0, 'state0', 'NY');
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(
      POVERTY_INDEX,
      'Error! asset does not have all expected columns: ' +
          'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');

  // None -> good columns
  setSelectWithDelayedEvaluate(1, 'state1', 'NY');
  checkSelectBorder(INCOME_INDEX, 'rgb(0, 255, 0)');
  checkHoverText(INCOME_INDEX, 'Success! asset has all expected columns');

  // good -> good
  setSelectWithDelayedEvaluate(1, 'state0', 'NY');
  checkSelectBorder(INCOME_INDEX, 'rgb(0, 255, 0)');
  checkHoverText(INCOME_INDEX, 'Success! asset has all expected columns');

  // good -> None
  // should return immediately, no release needed.
  setFirstSelectInScoreRowTo(1, 'None');
  checkSelectBorder(INCOME_INDEX, 'rgb(255, 255, 255)');
  checkHoverText(INCOME_INDEX, '');


  // No expected rows
  featureCollectionStub.withArgs('state4').callsFake(
      () => goodIncomeBadPovertyFeature);
  setSelectWithDelayedEvaluate(4, 'state0', 'NY');

  checkSelectBorder(BUILDINGS_INDEX, 'rgb(0, 255, 0)');
  checkHoverText(BUILDINGS_INDEX, 'No expected columns');
  setFirstSelectInScoreRowTo(4, 'None');
  checkSelectBorder(BUILDINGS_INDEX, 'rgb(255, 255, 255)');
  checkHoverText(BUILDINGS_INDEX, '');
});

it('tries to set a missing asset', () => {
  callEnableWhenReady(setUpDefaultData());
  setSelectWithDelayedEvaluate(0, 'state0', 'NY');
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(POVERTY_INDEX, 'Error! asset could not be found.');
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
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 255, 0)');
  // release second evaluate and column finishes with results from second.
  checkHoverText(POVERTY_INDEX, 'Checking columns...')
      .then(() => secondRelease());
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(
      POVERTY_INDEX,
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
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(
      POVERTY_INDEX,
      'Error! asset does not have all expected columns: ' +
          'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01')
      .then(() => firstRelease());
  checkSelectBorder(POVERTY_INDEX, 'rgb(255, 0, 0)');
  checkHoverText(
      POVERTY_INDEX,
      'Error! asset does not have all expected columns: ' +
          'GEOid2,GEOdisplay-label,HD01_VD02,HD01_VD01');
});

it('shows pending then values for state-based disaster, damage cascades',
   () => {
     // Track Firestore updates.
     const updateDisasterSpy =
         cy.spy(UpdateFirestoreDisaster, 'updateDataInFirestore');
     let callCount = 1;
     /**
      * Asserts there has been exactly one Firestore update since last call.
      */
     function assertFirestoreUpdate() {
       const expectedCalls = callCount++;
       cyQueue(
           () => expect(updateDisasterSpy).to.have.callCount(expectedCalls));
     }

     // Delay results until we're ready, for both state and disaster.
     let stateAssetListingResult;
     stateStub.returns(
         new Promise((resolve) => stateAssetListingResult = resolve));
     const asset1 = ee.FeatureCollection([ee.Feature(null, {'a-key': 0})]);
     const asset2 = ee.FeatureCollection([ee.Feature(null, {'b-key': 0})]);

     let disasterAssetListingResult;
     disasterStub.returns(
         new Promise((resolve) => disasterAssetListingResult = resolve));

     // We'll cascade damage asset properties.
     const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
     featureCollectionStub.withArgs('asset1').returns(asset1);
     featureCollectionStub.withArgs('found-asset').returns(asset1);
     featureCollectionStub.withArgs('asset2').returns(asset2);

     // Set properties up so that poverty asset is found, income asset is not
     // found, and svi is never set.
     const currentData = createDefaultStateBasedFirestoreData();
     currentData.assetData.stateBasedData.snapData.paths.NY = 'found-asset';
     currentData.assetData.stateBasedData.incomeAssetPaths.NY = 'missing-asset';
     currentData.assetData.damageAssetPath = 'missing-asset';
     currentData.assetData.noDamageKey = 'a-key';
     currentData.assetData.noDamageValue = 'a-value';
     const initializationDone =
         enableWhenFirestoreReady(new Map([[getDisaster(), currentData]]));
     // Give promise a chance to start running.
     cy.wait(0);

     assertKickoffAndSelectPending(getSelectForScoreAssetIndex(POVERTY_INDEX));
     assertKickoffAndSelectPending(getDamageSelect());
     // Because damage asset is set in Firestore, and column key is also set
     // in Firestore, we display the no-damage column and no-damage value
     // while retrieving data from EE.
     assertKickoffAndSelectWithPathPending(NODAMAGE_COLUMN_INFO.path);
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
         .should('have.value', 'a-value');

     // Release the state assets.
     cyQueue(() => stateAssetListingResult(new Map([
               ['found-asset', ENABLED_COLLECTION],
               ['other-asset', ENABLED_COLLECTION],
             ])));
     // Poverty is set as expected.
     getSelectForScoreAssetIndex(POVERTY_INDEX).should('not.be.disabled');
     getSelectForScoreAssetIndex(POVERTY_INDEX)
         .should('have.value', 'found-asset');
     // Income doesn't have a value because its value was not in asset list.
     getSelectForScoreAssetIndex(INCOME_INDEX).should('not.be.disabled');
     getSelectForScoreAssetIndex(INCOME_INDEX).should('have.value', '');
     // SVI has nothing.
     getSelectForScoreAssetIndex(SVI_INDEX).should('not.be.disabled');
     getSelectForScoreAssetIndex(SVI_INDEX).should('have.value', '');
     // Damage is still pending.
     assertKickoffAndSelectPending(getDamageSelect());
     // Release the disaster assets.
     cyQueue(() => disasterAssetListingResult(new Map([
               ['asset1', ENABLED_COLLECTION],
               ['asset2', ENABLED_COLLECTION],
             ])));
     // Initialization can now complete.
     cy.wrap(initializationDone);
     // Damage asset was not found.
     getDamageSelect().should('have.value', '');
     // Since damage has no value on page, no-damage column/value are hidden.
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
         .should('not.be.visible');
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
         .should('not.be.visible');
     // There have been no Firestore updates triggered by page load.
     cyQueue(() => expect(updateDisasterSpy).to.not.be.called);

     // Change the damage asset to one with no-damage column.
     getDamageSelect().select('asset1').blur();
     // Column and value both visible now, with correct values.
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path).should('be.visible');
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
         .should('have.value', 'a-key');
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path).should('be.visible');
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
         .should('have.value', 'a-value');
     assertFirestoreUpdate();

     // Change to an asset without the no-damage column.
     getDamageSelect().select('asset2').blur();
     // Since there is an asset, column select is visible.
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path).should('be.visible');
     // But it has no selection, and the value input is hidden.
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
         .should('have.value', '');
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
         .should('not.be.visible');
     assertFirestoreUpdate();

     // Switch back to asset1: looks the same as before.
     getDamageSelect().select('asset1').blur();
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path).should('be.visible');
     getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
         .should('have.value', 'a-key');
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path).should('be.visible');
     getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
         .should('have.value', 'a-value');
     assertFirestoreUpdate();
   });

describe('Tests for flexible disasters', () => {
  it('does basic interactions for flexible', () => {
    // Track Firestore updates.
    const updateDisasterSpy =
        cy.spy(UpdateFirestoreDisaster, 'updateDataInFirestore');
    let callCount = 1;
    /** Asserts there has been exactly one Firestore update since last call. */
    function assertFirestoreUpdate() {
      const expectedCalls = callCount++;
      cy.wait(0).then(
          () => expect(updateDisasterSpy).to.have.callCount(expectedCalls));
    }

    // Delay results until we're ready.
    const asset1 = ee.FeatureCollection([ee.Feature(null, {'a-key': 0})]);
    const asset2 = ee.FeatureCollection([ee.Feature(null, {'b-key': 0})]);
    const noGeoAsset =
        ee.FeatureCollection([ee.Feature(null, {'a-key': 0, 'b-key': 1})]);

    let disasterAssetListingResult;
    disasterStub.returns(
        new Promise((resolve) => disasterAssetListingResult = resolve));

    const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
    featureCollectionStub.withArgs('asset1').returns(asset1);
    featureCollectionStub.withArgs('asset2').returns(asset2);
    featureCollectionStub.withArgs('noGeoAsset').returns(noGeoAsset);

    const currentData = createDisasterData(null);
    currentData.assetData.damageAssetPath = 'missing-asset';
    currentData.assetData.noDamageKey = 'a-key';
    currentData.assetData.noDamageValue = 'a-value';
    const {assetData: {flexibleData}} = currentData;
    flexibleData.povertyPath = 'missing-asset';
    flexibleData.povertyRateKey = 'a-key';
    flexibleData.districtDescriptionKey = 'b-key';
    flexibleData.povertyHasGeometry = false;
    flexibleData.geographyPath = 'missing-asset';
    flexibleData.buildingSource = BuildingSource.DAMAGE;
    const initializationDone =
        enableWhenFirestoreReady(new Map([[getDisaster(), currentData]]));
    // Give promise a chance to start running.
    cy.wait(0);
    cy.get('#kickoff-button').should('be.disabled');
    cy.get('#kickoff-button').should('have.text', 'Pending...');

    assertKickoffAndSelectWithPathPending(componentsData.poverty.path);
    assertKickoffAndSelectPending(getDamageSelect());
    // Data says poverty has no geometry, so geography initially visible.
    cy.get('#flexible-geography-asset-data').should('be.visible');
    // Because damage asset is set in Firestore, and column key is also set
    // in Firestore, we display the no-damage column and no-damage value
    // while retrieving data from EE.
    assertKickoffAndSelectWithPathPending(NODAMAGE_COLUMN_INFO.path);
    getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
        .should('have.value', 'a-value');
    // Release the disaster assets.
    cyQueue(() => disasterAssetListingResult(new Map([
              ['asset1', ENABLED_COLLECTION],
              ['asset2', ENABLED_COLLECTION],
              [
                'noGeoAsset',
                {
                  type: LayerType.FEATURE_COLLECTION,
                  hasGeometry: false,
                  disabled: true,
                },
              ],
            ])));

    // Initialization can now complete.
    cy.wrap(initializationDone);
    getSelectFromPropertyPath(componentsData.poverty.path)
        .should('have.value', '');
    // Geography select not visible because no valid geography asset found.
    cy.get('#flexible-geography-asset-data').should('not.be.visible');
    // Damage asset was not found.
    getDamageSelect().should('have.value', '');
    // Since damage has no value on page, no-damage column/value are hidden:
    // building counts do come from damage, but irrelevant if damage missing.
    getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
        .should('not.be.visible');
    getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
        .should('not.be.visible');
    cy.get('#kickoff-button').should('be.disabled');
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Missing poverty asset; must specify either damage asset or map ' +
                'bounds; warning: created asset will be missing building ' +
                'counts');
    // There have been no Firestore updates triggered by page load.
    cyQueue(() => expect(updateDisasterSpy).to.not.be.called);

    // Check available assets for damage: noGeoAsset is disabled.
    getDamageSelect().within(() => {
      cy.get('option').should('have.length', 4);
      cy.get('option').contains('None').should('be.enabled');
      cy.get('option').contains('asset1').should('be.enabled');
      cy.get('option').contains('asset2').should('be.enabled');
      cy.get('option').contains('noGeoAsset').should('be.disabled');
    });
    // Change the damage asset to one with no-damage column.
    getDamageSelect().select('asset1').blur();
    assertFirestoreUpdate();
    // Column and value both visible now, with correct values.
    getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path).should('be.visible');
    getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
        .should('have.value', 'a-key');
    getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path).should('be.visible');
    getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
        .should('have.value', 'a-value');
    cy.get('span').contains(
        'must be specified since damage contains all buildings');
    cy.get('#kickoff-button').should('be.disabled');
    cy.get('#kickoff-button').should('have.text', 'Missing poverty asset');

    // Check available assets for poverty: everything is allowed.
    getSelectFromPropertyPath(componentsData.poverty.path).within(() => {
      cy.get('option').should('have.length', 4);
      cy.get('option').contains('None').should('be.enabled');
      cy.get('option').contains('asset1').should('be.enabled');
      cy.get('option').contains('asset2').should('be.enabled');
      cy.get('option').contains('noGeoAsset').should('be.enabled');
    });

    // Choose an asset with geometry, and with one of the expected columns.
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    assertFirestoreUpdate();
    const povertyColumns = componentsData.poverty.columns;
    getSelectFromPropertyPath(povertyColumns[0].path).within(() => {
      cy.get('option').should('have.length', 2);
      cy.get('option').contains('None');
      cy.get('option').contains('a-key');
    });
    // Rate column's value is now valid. Description missing, geoid always null.
    getSelectFromPropertyPath(povertyColumns[0].path)
        .should('have.value', 'a-key');
    getSelectFromPropertyPath(povertyColumns[1].path).should('have.value', '');
    getSelectFromPropertyPath(povertyColumns[2].path).should('have.value', '');
    cy.get('#flexible-geography-asset-data').should('not.be.visible');
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district ' +
                'description column, district identifier column');

    // Choose an asset without geometries, but with a-key and b-key as columns.
    getSelectFromPropertyPath(componentsData.poverty.path).select('noGeoAsset');
    assertFirestoreUpdate();
    getSelectFromPropertyPath(componentsData.geography.path).within(() => {
      cy.get('option').should('have.length', 4);
      cy.get('option').contains('None').should('be.enabled');
      cy.get('option').contains('asset1').should('be.enabled');
      cy.get('option').contains('asset2').should('be.enabled');
      cy.get('option').contains('noGeoAsset').should('be.disabled');
    });
    // First two columns' values now valid. Third's still missing.
    getSelectFromPropertyPath(povertyColumns[0].path)
        .should('have.value', 'a-key');
    getSelectFromPropertyPath(povertyColumns[1].path)
        .should('have.value', 'b-key');
    getSelectFromPropertyPath(povertyColumns[2].path).should('have.value', '');
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset');

    // Use buildings asset: damage no longer needed for building counts.
    cy.get('#buildings-source-buildings').click();
    assertFirestoreUpdate();
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset; missing buildings asset');
    cy.get('span').contains(
        'distinguish between damaged and undamaged buildings (optional: if ' +
        'omitted, all buildings in damage asset are considered damaged)');
    // no-damage value still visible because no-damage column has value.
    getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path).should('be.visible');
    // Invisible after no-damage column unset.
    getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path).select('None').blur();
    assertFirestoreUpdate();
    getSelectFromPropertyPath(NODAMAGE_VALUE_INFO.path)
        .should('not.be.visible');
    // No-damage column is hidden if damage not set.
    getDamageSelect().select('None').blur();
    assertFirestoreUpdate();
    getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
        .should('not.be.visible');

    // Change buildings asset to one with geometries and verify columns not
    // there.
    getSelectFromPropertyPath(componentsData.buildings.path)
        .select('asset1')
        .blur();
    assertFirestoreUpdate();
    // Data was actually written to Firestore.
    readFirestoreAfterWritesFinish().then((data) => {
      const {flexibleData} = data.assetData;
      expect(flexibleData.buildingHasGeometry).to.be.true;
      expect(flexibleData.buildingSource).to.eql(BuildingSource.BUILDING);
    });
    // With geometries, no required buildings columns.
    getSelectFromPropertyPath(componentsData.buildings.columns[0].path)
        .should('not.be.visible');
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset; must specify either damage ' +
                'asset or map bounds');

    // Now switch to buildings asset without geometries.
    getSelectFromPropertyPath(componentsData.buildings.path)
        .select('noGeoAsset')
        .blur();
    assertFirestoreUpdate();
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset; must specify properties ' +
                'from buildings asset: district identifier column, building ' +
                'counts column; must specify either damage asset or map ' +
                'bounds');

    // Set columns for buildings.
    getSelectFromPropertyPath(componentsData.buildings.columns[0].path)
        .select('a-key')
        .blur();
    assertFirestoreUpdate();
    getSelectFromPropertyPath(componentsData.buildings.columns[1].path)
        .select('a-key')
        .blur();
    assertFirestoreUpdate();
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset; must specify either damage ' +
                'asset or map bounds');

    // Switch to poverty for building counts.
    cy.get('#buildings-source-poverty').click();
    assertFirestoreUpdate();
    getSelectFromPropertyPath(componentsData.buildings.path)
        .should('not.be.visible');
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset; must specify building-count' +
                ' column (choose damage asset as buildings source for now if ' +
                'you don\'t need buildings); must specify either damage asset' +
                ' or map bounds');
    getSelectFromPropertyPath(POVERTY_BUILDINGS_PATH).select('b-key').blur();
    assertFirestoreUpdate();
    cy.get('#kickoff-button')
        .should(
            'have.text',
            'Must specify properties from poverty asset: district identifier ' +
                'column; missing geography asset; must specify either damage ' +
                'asset or map bounds');
  });

  it('switches asset while pending', () => {
    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolve1;
    let resolve2;
    propertyNamesStub.withArgs('asset1').returns(
        new Promise((resolve) => resolve1 = resolve));
    propertyNamesStub.withArgs('asset2').returns(
        new Promise((resolve) => resolve2 = resolve));
    const currentData = createDisasterData(null);
    currentData.assetData.flexibleData.povertyRateKey = 'c';
    cy.wrap(enableWhenFirestoreReady(new Map([[getDisaster(), currentData]])));
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path);
    cy.get('#kickoff-button').should('have.text', 'Pending...');
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset2')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path);
    cy.get('#kickoff-button')
        .should('have.text', 'Pending...')
        .then(() => resolve1(['a', 'b']));
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path);
    cy.get('#kickoff-button')
        .should('have.text', 'Pending...')
        .then(() => resolve2(['c', 'd']));
    getSelectFromPropertyPath(componentsData.poverty.columns[0].path)
        .should('be.enabled');
    getSelectFromPropertyPath(componentsData.poverty.columns[0].path)
        .should('have.value', 'c');
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
  });

  it('switches asset while pending, then switches back', () => {
    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolve1;
    let resolve2;
    propertyNamesStub.withArgs('asset1').returns(
        new Promise((resolve) => resolve1 = resolve));
    propertyNamesStub.withArgs('asset2').returns(
        new Promise((resolve) => resolve2 = resolve));
    const currentData = createDisasterData(null);
    currentData.assetData.flexibleData.povertyRateKey = 'a';
    cy.wrap(enableWhenFirestoreReady(new Map([[getDisaster(), currentData]])));
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path);
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset2')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path);
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path)
        .then(() => resolve2(['c', 'd']));
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path)
        .then(() => resolve1(['a', 'b']));
    getSelectFromPropertyPath(componentsData.poverty.columns[0].path)
        .should('be.enabled');
    getSelectFromPropertyPath(componentsData.poverty.columns[0].path)
        .should('have.value', 'a');
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
  });

  it('makes geography unneeded while waiting on column retrieval', () => {
    disasterStub.returns(Promise.resolve(new Map([
      ['asset1', ENABLED_COLLECTION],
      ['asset2', ENABLED_COLLECTION],
      [
        'noGeoAsset',
        {
          type: LayerType.FEATURE_COLLECTION,
          hasGeometry: false,
          disabled: true,
        },
      ],
    ])));

    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolveFunction;
    propertyNamesStub.withArgs('asset1').returns(Promise.resolve(['a', 'b']));
    propertyNamesStub.withArgs('noGeoAsset').returns(Promise.resolve([
      'a',
      'b',
    ]));
    propertyNamesStub.withArgs('asset2').returns(
        new Promise((resolve) => resolveFunction = resolve));
    cy.wrap(enableWhenFirestoreReady(
        new Map([[getDisaster(), createDisasterData(null)]])));
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('noGeoAsset')
        .blur();
    // Columns of noGeoAsset returned instantly, so not waiting for anything.
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    getSelectFromPropertyPath(componentsData.geography.path)
        .select('asset2')
        .blur();
    // Columns of asset2 not returned, so now pending on geography cascade.
    assertKickoffAndSelectWithPathPending(
        componentsData.geography.columns[0].path);
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    // Geography no longer relevant (new poverty asset 'asset1' has geometries).
    cy.get('#kickoff-button')
        .should('not.have.text', 'Pending...')
        .then(() => resolveFunction(['a', 'b']));
    // Relevant again!
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('noGeoAsset')
        .blur();
    getSelectFromPropertyPath(componentsData.geography.columns[0].path)
        .within(() => cy.get('option').should('have.length', 3));
  });

  it('makes geography unneeded while waiting, then switches back', () => {
    disasterStub.returns(Promise.resolve(new Map([
      ['asset1', ENABLED_COLLECTION],
      ['asset2', ENABLED_COLLECTION],
      [
        'noGeoAsset',
        {
          type: LayerType.FEATURE_COLLECTION,
          hasGeometry: false,
          disabled: true,
        },
      ],
    ])));

    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolveFunction;
    propertyNamesStub.withArgs('asset1').returns(Promise.resolve(['a', 'b']));
    propertyNamesStub.withArgs('noGeoAsset').returns(Promise.resolve([
      'a',
      'b',
    ]));
    propertyNamesStub.withArgs('asset2').returns(
        new Promise((resolve) => resolveFunction = resolve));
    cy.wrap(enableWhenFirestoreReady(
        new Map([[getDisaster(), createDisasterData(null)]])));
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('noGeoAsset')
        .blur();
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    getSelectFromPropertyPath(componentsData.geography.path)
        .select('asset2')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.geography.columns[0].path);
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('noGeoAsset')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.geography.columns[0].path)
        .then(() => resolveFunction(['a', 'b']));
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    getSelectFromPropertyPath(componentsData.geography.columns[0].path)
        .within(() => cy.get('option').should('have.length', 3));
  });

  it('makes buildings unneeded while waiting on column retrieval', () => {
    disasterStub.returns(Promise.resolve(new Map([
      [
        'noGeoAsset',
        {
          type: LayerType.FEATURE_COLLECTION,
          hasGeometry: false,
          disabled: true,
        },
      ],
    ])));
    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolveFunction;
    propertyNamesStub.returns(
        new Promise((resolve) => resolveFunction = resolve));
    cy.wrap(enableWhenFirestoreReady(
        new Map([[getDisaster(), createDisasterData(null)]])));
    // All pending operations have completed, since no assets are set.
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    cy.get('#buildings-source-buildings').click();
    getSelectFromPropertyPath(componentsData.buildings.path)
        .select('noGeoAsset')
        .blur();
    // Now pending, since we're waiting on columns from buildings asset.
    assertKickoffAndSelectWithPathPending(
        componentsData.buildings.columns[0].path);
    // Not pending anymore, since buildings asset no longer relevant.
    cy.get('#buildings-source-poverty').click();
    cy.get('#kickoff-button')
        .should('not.have.text', 'Pending...')
        .then(() => resolveFunction(['a', 'b']));
    // Relevant again!
    cy.get('#buildings-source-buildings').click();
    getSelectFromPropertyPath(componentsData.buildings.columns[0].path)
        .within(() => cy.get('option').should('have.length', 3));
  });

  it('makes buildings unneeded while waiting, then switches back', () => {
    disasterStub.returns(Promise.resolve(new Map([
      [
        'noGeoAsset',
        {
          type: LayerType.FEATURE_COLLECTION,
          hasGeometry: false,
          disabled: true,
        },
      ],
    ])));
    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolveFunction;
    propertyNamesStub.returns(
        new Promise((resolve) => resolveFunction = resolve));
    cy.wrap(enableWhenFirestoreReady(
        new Map([[getDisaster(), createDisasterData(null)]])));
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    cy.get('#buildings-source-buildings').click();
    getSelectFromPropertyPath(componentsData.buildings.path)
        .select('noGeoAsset')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.buildings.columns[0].path);
    cy.get('#buildings-source-poverty').click();
    cy.get('#kickoff-button').should('not.have.text', 'Pending...');
    // Relevant again!
    cy.get('#buildings-source-buildings').click();
    assertKickoffAndSelectWithPathPending(
        componentsData.buildings.columns[0].path)
        .then(() => resolveFunction(['a', 'b']));
    getSelectFromPropertyPath(componentsData.buildings.columns[0].path)
        .within(() => cy.get('option').should('have.length', 3));
  });

  it('switches flexible disasters while still pending', () => {
    // Delay results until we're ready.
    const asset1 = ee.FeatureCollection([ee.Feature(null, {'a-key': 0})]);
    const asset2 = ee.FeatureCollection([ee.Feature(null, {'b-key': 0})]);
    const noGeoAsset =
        ee.FeatureCollection([ee.Feature(null, {'a-key': 0, 'b-key': 1})]);

    let firstListingResult;
    let secondListingResult;
    disasterStub.reset();
    const firstPromise = new Promise((resolve) => firstListingResult = resolve);
    disasterStub.withArgs(getDisaster()).returns(firstPromise);
    const secondPromise =
        new Promise((resolve) => secondListingResult = resolve);
    disasterStub.withArgs('otherDisaster').returns(secondPromise);

    const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
    featureCollectionStub.withArgs('asset1').returns(asset1);
    featureCollectionStub.withArgs('asset2').returns(asset2);
    featureCollectionStub.withArgs('noGeoAsset').returns(noGeoAsset);

    const data1 = createDisasterData(null);
    let {flexibleData} = data1.assetData;
    flexibleData.povertyPath = 'asset1';
    flexibleData.povertyRateKey = 'a-key';
    const data2 = createDisasterData(null);
    ({flexibleData} = data2.assetData);
    flexibleData.povertyPath = 'asset2';
    flexibleData.povertyRateKey = 'b-key';
    const promise = enableWhenFirestoreReady(
        new Map([[getDisaster(), data1], ['otherDisaster', data2]]));
    cy.wait(0);
    cy.get('#kickoff-button').should('have.text', 'Pending...');
    let otherPromise;
    cy.get('div')
        .contains('Poverty rate column')
        .should('have.length', 1)
        .then(() => {
          // Switch disasters without finishing EE listing.
          window.localStorage.setItem('disaster', 'otherDisaster');
          otherPromise = onSetDisaster();
        });
    // No duplicate text.
    cy.get('div').contains('Poverty rate column').should('have.length', 1);

    // Release first call. Nothing about page changes.
    cyQueue(
        () => firstListingResult(new Map([['asset1', ENABLED_COLLECTION]])));
    assertKickoffAndSelectWithPathPending(componentsData.poverty.path);
    // Confirm that first call really is done, then let second finish.
    cy.wrap(promise).then(
        () => secondListingResult(new Map([['asset2', ENABLED_COLLECTION]])));
    // Second one is done.
    cy.wrap(otherPromise);
    getSelectFromPropertyPath(componentsData.poverty.path).should('be.enabled');
    getSelectFromPropertyPath(componentsData.poverty.path)
        .should('have.value', 'asset2');
    getSelectFromPropertyPath(componentsData.poverty.columns[0].path)
        .should('have.value', 'b-key');
  });

  it('switches from state-based to flexible disaster while damage pending',
     () => {
       let firstListingResult;
       let secondListingResult;
       disasterStub.reset();
       const firstPromise =
           new Promise((resolve) => firstListingResult = resolve);
       disasterStub.withArgs(getDisaster()).returns(firstPromise);
       const secondPromise =
           new Promise((resolve) => secondListingResult = resolve);
       disasterStub.withArgs('otherDisaster').returns(secondPromise);

       const asset2 = ee.FeatureCollection([ee.Feature(null, {'b-key': 0})]);
       const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
       featureCollectionStub.withArgs('asset2').returns(asset2);

       const stateBasedData = setUpDefaultData();
       let {assetData} = stateBasedData;
       assetData.damageAssetPath = 'asset1';
       assetData.noDamageKey = 'a-key';
       const flexibleData = createDisasterData(null);
       ({assetData} = flexibleData);
       assetData.damageAssetPath = 'asset2';
       assetData.noDamageKey = 'b-key';
       const promise = enableWhenFirestoreReady(new Map(
           [[getDisaster(), stateBasedData], ['otherDisaster', flexibleData]]));
       cy.wait(0);
       let otherPromise;
       assertKickoffAndSelectPending(getDamageSelect()).then(() => {
         // Switch disasters without finishing EE listing.
         window.localStorage.setItem('disaster', 'otherDisaster');
         otherPromise = onSetDisaster();
       });
       // We've switched.
       cy.get('div').contains('Poverty rate column');
       // Damage select still pending.
       assertKickoffAndSelectPending(getDamageSelect());

       // Release first call. Nothing about page changes.
       cyQueue(
           () => firstListingResult(new Map([['asset1', ENABLED_COLLECTION]])));
       assertKickoffAndSelectPending(getDamageSelect());
       // Confirm that first call really is done, then let second finish.
       cy.wrap(promise).then(
           () =>
               secondListingResult(new Map([['asset2', ENABLED_COLLECTION]])));
       cy.wrap(otherPromise);
       getDamageSelect().should('be.enabled');
       getDamageSelect().should('have.value', 'asset2');
       getSelectFromPropertyPath(NODAMAGE_COLUMN_INFO.path)
           .should('have.value', 'b-key');
     });

  // Sadly this test doesn't actually fail even if production code incorrectly
  // tries to proceed after the columns are returned: the exception is thrown in
  // a Promise, so doesn't make it to Cypress. However, there is an error in the
  // console.
  it('switches from flexible to state-based while pending', () => {
    const propertyNamesStub = cy.stub(ListEeAssets, 'getAssetPropertyNames');
    let resolveColumns;
    propertyNamesStub.returns(
        new Promise((resolve) => resolveColumns = resolve));

    const flexibleData = createDisasterData(null);
    const stateBasedData = setUpDefaultData();
    cy.wrap(enableWhenFirestoreReady(new Map(
        [[getDisaster(), flexibleData], ['otherDisaster', stateBasedData]])));
    getSelectFromPropertyPath(componentsData.poverty.path)
        .select('asset1')
        .blur();
    assertKickoffAndSelectWithPathPending(
        componentsData.poverty.columns[0].path)
        .then(() => {
          // Switch disasters without finishing EE listing.
          window.localStorage.setItem('disaster', 'otherDisaster');
          onSetDisaster();
        });
    // We've switched. Everything should be done.
    cy.get('td').contains('SVI');
    cy.get('#kickoff-button').should('not.contain', 'Pending...');
    // Release first call. Nothing about page changes.
    cyQueue(() => resolveColumns(['a', 'b']));
    cy.get('#kickoff-button').should('not.contain', 'Pending...');
  });
});

/**
 * Asserts that select and kickoff button both pending. Passing a Cypress object
 * around is kind of wonky, but seems to be working for now.
 * @param {Cypress.Chainable<JQuery<HTMLSelectElement>>} select
 * @return {Cypress.Chainable<*>} Select for chaining
 */
function assertKickoffAndSelectPending(select) {
  // If select pending, kickoff must be too.
  select.should('be.disabled');
  select.should('have.text', 'pending...');
  select.should('have.value', '');
  cy.get('#kickoff-button').should('have.text', 'Pending...');
  return cy.get('#kickoff-button').should('be.disabled');
}

/**
 * @param {PropertyPath} path Select for {@link assertKickoffAndSelectPending}
 * @return {Cypress.Chainable<*>}
 */
function assertKickoffAndSelectWithPathPending(path) {
  return assertKickoffAndSelectPending(getSelectFromPropertyPath(path));
}

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
    const button = doc.createElement('button');
    button.id = 'kickoff-button';
    button.disabled = true;
    button.hidden = true;
    doc.body.appendChild(button);

    // State-based table
    const tbody = doc.createElement('tbody');
    tbody.id = 'asset-selection-table-body';
    doc.body.appendChild(tbody);

    // Flexible elements of page.
    appendElement('flexible-poverty-asset-data', doc);
    appendElement('flexible-geography-asset-data', doc);
    appendElement('buildings-source-buildings-div', doc);
    appendElement('buildings-source-poverty-div', doc);
    appendElement('buildings-source-buildings', doc, 'input')
        .prop('type', 'radio')
        .prop('name', 'buildings');
    appendElement('buildings-source-poverty', doc, 'input')
        .prop('type', 'radio')
        .prop('name', 'buildings');
    appendElement('buildings-source-damage', doc, 'input')
        .prop('type', 'radio')
        .prop('name', 'buildings');

    // Damage.
    appendElement('damage-intro-span', doc, 'span');
    appendElement('damage-asset-div', doc);
    const boundsDiv = appendElement('map-bounds-div', doc).hide();
    const mapDiv = $(doc.createElement('div'))
                       .css('width', '20%')
                       .css('height', '20%')
                       .prop('id', 'score-bounds-map');
    boundsDiv.append(mapDiv);
    setUpScoreBoundsMap(mapDiv[0]);
    return doc;
  });
}

/**
 * @param {string} id Id of new element
 * @param {document} doc Document provided by `cy.document`
 * @param {string} tag HTML tag
 * @return {jQuery<HTMLElement>} Constructed element
 */
function appendElement(id, doc, tag = 'div') {
  const elt = doc.createElement(tag);
  elt.id = id;
  doc.body.appendChild(elt);
  return $(elt);
}

/**
 * Injects necessary data (stubs EE function, adds state data manually) and
 * returns default data to be passed to {@link callEnableWhenReady}.
 * @return {Object} equivalent of fetch from Firestore for a single disaster
 */
function setUpDefaultData() {
  const assets = new Map();
  for (let i = 0; i <= 4; i++) {
    assets.set('state' + i, {disabled: false, hasGeometry: true});
  }
  stateStub.withArgs('NY').returns(Promise.resolve(assets));
  return createDefaultStateBasedFirestoreData();
}

/** @return {{assetData: AssetData, layerArray: Array<*>}} */
function createDefaultStateBasedFirestoreData() {
  const currentData = createDisasterData(['NY']);
  currentData.assetData.scoreBoundsCoordinates = scoreBoundsCoordinates.map(
      (latlng) => new firebase.firestore.GeoPoint(latlng.lat, latlng.lng));
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
      () => enableWhenFirestoreReady(new Map([[getDisaster(), currentData]])));
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
 * @return {Cypress.Chainable<DisasterDocument>} Contents of Firestore document
 */
function readFirestoreAfterWritesFinish() {
  return cy.get('@savedStub')
      .then(
          (savedStub) => new Promise((resolve) => savedStub.callsFake(resolve))
                             .then(() => savedStub.resetHistory()))
      .then(readDisasterDocument);
}


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
 *     stateBasedScoreAssetTypes}
 * @return {Cypress.Chainable} Cypress promise of the td
 */
function getFirstTdInScoreRow(rowNum) {
  return cy.get('#' + assetSelectionRowPrefix + rowNum).find('td').first();
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
 * @param {number} index Index of score asset type
 * @param {string} rgbString e.g. 'rgb(0, 0, 0)'
 * @return {Cypress.Chainable}
 */
function checkSelectBorder(index, rgbString) {
  return getSelectForScoreAssetIndex(index, {timeout: 5000})
      .should('have.css', 'border-color')
      .and('eq', rgbString);
}

/**
 * Asserts on the hover text for the given select.
 * @param {number} index Index of score asset type
 * @param {string} text
 * @return {Cypress.Chainable}
 */
function checkHoverText(index, text) {
  return getSelectForScoreAssetIndex(index)
      .invoke('attr', 'title')
      .should('eq', text);
}

/**
 * Sets a select and checks that correct state exists during checking.
 * @param {number} rowNum row number of score asset selector table.
 * @param {string} text text of an option in the select identified by {@code
 *     tdId}
 * @param {string} state e.g. 'NY'
 */
function setSelectWithDelayedEvaluate(rowNum, text, state) {
  const release = getConvertEeObjectToPromiseRelease().releaseLatch;
  setFirstSelectInScoreRowTo(rowNum, text);
  const scoreAssetType = stateBasedScoreAssetTypes[rowNum];
  checkSelectBorder(rowNum, 'rgb(255, 255, 0)');
  checkHoverText(
      rowNum,
      scoreAssetType.expectedColumns.length ? 'Checking columns...' :
                                              'Checking...');
  release();
}

/** @return {Cypress.Chainable<JQuery<HTMLSelectElement>>} */
function getDamageSelect() {
  return getSelectFromPropertyPath(DAMAGE_PROPERTY_PATH);
}

/**
 * Gets NY select corresponding to index from {@link stateBasedScoreAssetTypes}.
 * @param {number} index
 * @param {Object} options Options for {@code cy.get}
 * @return {Cypress.Chainable<JQuery<HTMLElement>>}
 */
function getSelectForScoreAssetIndex(index, options = {}) {
  return getSelectFromPropertyPath(
      stateBasedScoreAssetTypes[index].propertyPath.concat(['NY']), options);
}

/**
 * @param {PropertyPath} path
 * @param {Object} options Options for {@code cy.get}
 * @return {Cypress.Chainable<JQuery<HTMLElement>>}
 */
function getSelectFromPropertyPath(path, options = {}) {
  return cy.get('#' + makeInputElementIdFromPath(path), options);
}
