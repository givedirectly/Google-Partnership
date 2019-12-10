import {getFirestoreRoot, readDisasterDocument} from '../../../docs/firestore_document.js';
import {assetDataTemplate, createDisasterData} from '../../../docs/import/create_disaster_lib.js';
import {createScoreAsset} from '../../../docs/import/create_score_asset.js';
import {assetSelectionRowPrefix, disasterData, initializeDamageSelector, initializeScoreSelectors, scoreAssetTypes, setUpScoreSelectorTable, stateAssets, validateUserFields} from '../../../docs/import/manage_disaster';
import {addDisaster, deleteDisaster, writeNewDisaster} from '../../../docs/import/manage_disaster.js';
import {createOptionFrom} from '../../../docs/import/manage_layers.js';
import {convertEeObjectToPromise} from '../../../docs/map_util';
import {getDisaster} from '../../../docs/resources.js';
import * as Toast from '../../../docs/toast.js';
import {assertFirestoreMapBounds} from '../../support/firestore_map_bounds';
import {createAndAppend} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const KNOWN_STATE = 'WF';

describe('Unit tests for manage_disaster.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  before(() => {
    const disasterPicker = createAndAppend('select', 'disaster-dropdown');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');
    createAndAppend('div', 'compute-status');
  });
  let testData;
  let exportStub;
  let createFolderStub;
  let setAclsStub;
  beforeEach(() => {
    disasterData.clear();

    // Create a pretty trivial world: 2 block groups, each a 1x2 vertical
    // stripe. Under the covers, we scale all dimensions down because
    // production code creates an "envelope" 1 km wide around damage, and that
    // envelope is assumed to fully contain any block group that has any damage.
    const tigerBlockGroups = ee.FeatureCollection(
        [makeCensusBlockGroup(0), makeCensusBlockGroup(1)]);
    // Three damage points, one of them outside the block groups, just for fun,
    // and one of them in a block group with no SNAP info.
    const damageData = ee.FeatureCollection(
        [makePoint(0.4, 0.5), makePoint(1.5, .5), makePoint(10, 12)]);
    // Only one SNAP block group, in the west.
    const snapData = ee.FeatureCollection([makeSnapGroup('361', 10, 15)]);
    // One SVI tract, encompassing the whole state.
    const sviData = ee.FeatureCollection([makeSviTract(0.5)]);
    // One income block group, also in the west.
    const incomeData = ee.FeatureCollection([makeIncomeGroup('361', 37)]);
    // Four buildings, three of which are in our block group.
    const buildingsCollection = ee.FeatureCollection([
      makePoint(0.1, 0.9),
      makePoint(1.2, 0.5),
      makePoint(1.4, 0.7),
      makePoint(1.5, 0.5),
    ]);
    // Stub out delete and export. We'll assert on what was exported, below.
    cy.stub(ee.data, 'deleteAsset').callsFake((_, callback) => callback());
    exportStub = cy.stub(ee.batch.Export.table, 'toAsset')
                     .returns({start: () => {}, id: 'FAKE_ID'});
    createFolderStub =
        cy.stub(ee.data, 'createFolder')
            .callsFake((asset, overwrite, callback) => callback());
    setAclsStub = cy.stub(ee.data, 'setAssetAcl')
                      .callsFake((asset, acls, callback) => callback());

    cy.wrap(cy.stub(Toast, 'showToastMessage').withArgs('Saved')).as(
        'savedStub');

    // Test data is reasonably real. All of the keys should be able to vary,
    // with corresponding changes to test data (but no production changes). The
    // state must be real.
    testData = {
      states: ['NY'],
      asset_data: {
        damage_asset_path: damageData,
        map_bounds_sw: null,
        map_bounds_ne: null,
        block_group_asset_paths: {
          NY: tigerBlockGroups,
        },
        snap_data: {
          paths: {
            NY: snapData,
          },
          snap_key: 'test_snap_key',
          total_key: 'test_total_key',
        },
        svi_asset_paths: {
          NY: sviData,
        },
        svi_key: 'test_svi_key',
        income_asset_paths: {
          NY: incomeData,
        },
        income_key: 'testIncomeKey',
        building_asset_paths: {
          NY: buildingsCollection,
        },
      },
    };
  });

  it('Basic test', () => {
    const {boundsPromise, mapBoundsCallback} =
        makeCallbackForTextAndPromise('Found bounds');
    const promise = createScoreAsset(testData, mapBoundsCallback);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(exportStub).to.be.calledOnce;
          return convertEeObjectToPromise(exportStub.firstCall.args[0]);
        })
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(1);
          const feature = features[0];
          expect(feature.properties).to.eql({
            'BLOCK GROUP': 'Some state, group 361',
            'BUILDING COUNT': 3,
            'DAMAGE PERCENTAGE': 0.3333333333333333,
            'GEOID': '361',
            'MEDIAN INCOME': 37,
            'SNAP HOUSEHOLDS': 10,
            'SNAP PERCENTAGE': 0.6666666666666666,
            'SVI': 0.5,
            'TOTAL HOUSEHOLDS': 15,
          });
        });
    cy.wrap(boundsPromise);
    assertFirestoreMapBounds(
        scaleObject({sw: {lng: 0.4, lat: 0.5}, ne: {lng: 10, lat: 12}}));
  });

  it('Test with no damage asset', () => {
    testData.asset_data.damage_asset_path = null;
    const expectedLatLngBounds =
        scaleObject({sw: {lng: 0.39, lat: 0.49}, ne: {lng: 13, lat: 11}});
    testData.asset_data.map_bounds_sw =
        expectedLatLngBounds.sw.lat + ', ' + expectedLatLngBounds.sw.lng;
    testData.asset_data.map_bounds_ne =
        expectedLatLngBounds.ne.lat + ', ' + expectedLatLngBounds.ne.lng;

    const {boundsPromise, mapBoundsCallback} =
        makeCallbackForTextAndPromise('Wrote bounds');
    const promise = createScoreAsset(testData, mapBoundsCallback);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(exportStub).to.be.calledOnce;
          return convertEeObjectToPromise(exportStub.firstCall.args[0]);
        })
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(1);
          const feature = features[0];
          expect(feature.properties).to.eql({
            'BLOCK GROUP': 'Some state, group 361',
            'BUILDING COUNT': 3,
            'DAMAGE PERCENTAGE': 0,
            'GEOID': '361',
            'MEDIAN INCOME': 37,
            'SNAP HOUSEHOLDS': 10,
            'SNAP PERCENTAGE': 0.6666666666666666,
            'SVI': 0.5,
            'TOTAL HOUSEHOLDS': 15,
          });
        });
    cy.wrap(boundsPromise);
    assertFirestoreMapBounds(expectedLatLngBounds);
  });

  it('Test missing data', () => {
    testData.asset_data = null;
    expect(createScoreAsset(testData)).to.be.null;
    expect(exportStub).to.not.be.called;
  });

  it('damage asset/map-bounds elements', () => {
    setAssetDataAndCreateDamageInputsForScoreValidationTests();
    cy.get('#map-bounds-div')
        .should('be.visible')
        .then(() => $('#map-bounds-div').hide());
    cy.get('#map-bounds-div')
        .should('not.be.visible')
        .then(() => initializeDamageSelector(['asset1', 'asset2']));
    cy.get('#damage-asset-select').should('have.value', '');
    cy.get('#map-bounds-div').should('be.visible');
    cy.get('#map-bounds-sw').should('have.value', '0, 1');
    cy.get('#map-bounds-ne').should('have.value', '');
    cy.get('#map-bounds-ne').type('1, 1').blur();
    readFirestoreAfterWritesFinish().then(
        (doc) =>
            expect(doc.data()['asset_data']['map_bounds_ne']).to.eql('1, 1'));
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
        .should('eq', 5)
        .then(validateUserFields);
    // We haven't set much, so button is not enabled.
    cy.get('#process-button').should('be.disabled');
    cy.get('#process-button').should('have.text', allMissingText);

    // Confirm that entering just one corner of map doesn't help anything.
    cy.get('#map-bounds-sw').clear().type('0, 0').blur();
    cy.get('#process-button').should('have.text', allMissingText);
    // Adding the second corner gets rid of the "damage/bounds" missing part.
    cy.get('#map-bounds-ne').type('1, 1').blur();
    cy.get('#process-button').should('have.text', allStateAssetsMissingText);

    // Clearing puts us back where we started.
    cy.get('#map-bounds-ne').clear().blur();
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
      expect(assetData['map_bounds_sw']).to.eql('0, 0');
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
    const currentData = createDisasterData(['NY']);
    currentData['asset_data']['map_bounds_sw'] = '0, 1';
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
      doc.body.appendChild(boundsDiv);
      const swInput = doc.createElement('input');
      swInput.id = 'map-bounds-sw';
      boundsDiv.appendChild(swInput);
      const neInput = doc.createElement('input');
      neInput.id = 'map-bounds-ne';
      boundsDiv.appendChild(neInput);
      return doc;
    });
  }

  /**
   * Sets up tests for score asset data validation beyond just damage.
   * @return {Cypress.Chainable}
   */
  function setUpAssetValidationTests() {
    // Clear out any modifications we've done to the document.
    cy.visit('test_utils/empty.html');
    return setAssetDataAndCreateDamageInputsForScoreValidationTests().then(
        (doc) => {
          cy.stub(document, 'createElement')
              .callsFake((tag) => doc.createElement(tag));
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
   * happens like a DOM element not being found or a call to `cy.wait` (these
   * are the primary cases). So this function can be called after the write has
   * triggered, but the write will not be allowed to complete until after it
   * executes, assuming no `cy.wait` or difficult-to-find element accesses were
   * executed in the meantime.
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

// Make sure that our block groups aren't so big they escape the 1 km damage
// envelope. 1 degree of longitude is 111 km at the equator, so this should be
// plenty.
const distanceScalingFactor = 0.0001;

/**
 * Makes a NY Census block group that is a 1x2 rectangle, with southwest corner
 * (swLng, 0), and block group id given by swLng. Note that the group's geometry
 * is scaled.
 * @param {number} swLng
 * @return {ee.Feature}
 */
function makeCensusBlockGroup(swLng) {
  return ee.Feature(
      ee.Geometry.Rectangle(scaleArray([swLng, 0, swLng + 1, 2])),
      {GEOID: '36' + swLng});
}

/**
 * Makes a feature with a single point.
 * @param {number} lng
 * @param {number} lat
 * @return {ee.Feature}
 */
function makePoint(lng, lat) {
  return ee.Feature(ee.Geometry.Point(scaleArray([lng, lat])));
}

/**
 * Makes a fake Census block group with SNAP data.
 * @param {string} id Block group geoid
 * @param {number} snap Number of SNAP households
 * @param {number} total Total number of households
 * @return {ee.Feature}
 */
function makeSnapGroup(id, snap, total) {
  return ee.Feature(null, {
    'test_snap_key': snap,
    'test_total_key': total,
    'GEOdisplay-label': 'Some state, group ' + id,
    'GEOid2': id,
  });
}

/**
 * Makes a fake Census tract for the SVI FeatureCollection. The tract
 * encompasses the full state.
 * @param {number} svi SVI of tract
 * @return {ee.Feature}
 */
function makeSviTract(svi) {
  return ee.Feature(null, {'test_svi_key': svi, 'FIPS': '36'});
}

/**
 * Makes a fake Census block group for the income FeatureCollection.
 * @param {string} id Block group geoid
 * @param {number} income Average income of group
 * @return {ee.Feature}
 */
function makeIncomeGroup(id, income) {
  return ee.Feature(null, {testIncomeKey: income, GEOid2: id});
}

/**
 * Scales the given coordinate array by {@link distanceScalingFactor}.
 * @param {Array<number>} array
 * @return {Array<number>} The scaled array
 */
function scaleArray(array) {
  return array.map((num) => num * distanceScalingFactor);
}

/**
 * Scales the given object's numerical entries by {@link distanceScalingFactor}.
 * @param {Object} object LatLngBounds or a sub-object of that. Nothing complex!
 * @return {Object} The scaled object
 */
function scaleObject(object) {
  if (typeof (object) === 'number') {
    return object * distanceScalingFactor;
  }
  if (Array.isArray(object)) {
    return scaleArray(object);
  }
  const newObject = {};
  for (const key of Object.keys(object)) {
    newObject[key] = scaleObject(object[key]);
  }
  return newObject;
}

/**
 * Creates a callback for use with {@link createScoreAsset} so that we will be
 * informed when the Firestore write has completed. Returns a Promise that can
 * be waited on for that write to complete.
 * @param {string} expectedText Text contained in message when Firestore write
 *     is complete
 * @return {{boundsPromise: Promise, mapBoundsCallback: Function}}
 */
function makeCallbackForTextAndPromise(expectedText) {
  let resolveFunction = null;
  const boundsPromise = new Promise((resolve) => resolveFunction = resolve);
  const mapBoundsCallback = (message) => {
    if (message.includes(expectedText)) {
      resolveFunction();
    }
  };
  return {boundsPromise, mapBoundsCallback};
}

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
