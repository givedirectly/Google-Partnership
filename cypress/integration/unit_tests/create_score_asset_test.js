import {gdEePathPrefix} from '../../../docs/ee_paths.js';
import {convertEeObjectToPromise} from '../../../docs/ee_promise_cache.js';
import {backUpAssetAndStartTask, createScoreAssetForStateBasedDisaster} from '../../../docs/import/create_score_asset.js';
import * as Resources from '../../../docs/resources.js';
import {assertFirestoreMapBounds} from '../../support/firestore_map_bounds';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

const mockTask = {
  start: () => {},
  id: 'FAKE_ID',
};

describe('Unit tests for create_score_asset.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let testData;
  let exportStub;
  let renameStub;
  let taskStartStub;
  beforeEach(() => {
    // Create a trivial world: 2 block groups, each a 1x2 vertical stripe.
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
    renameStub =
        cy.stub(ee.data, 'renameAsset').callsFake((from, to, callback) => {
          expect(from).to.equal(Resources.getScoreAssetPath());
          expect(to).to.equal(Resources.getBackupScoreAssetPath());
          callback();
        });
    taskStartStub = cy.stub(mockTask, 'start');
    exportStub = cy.stub(ee.batch.Export.table, 'toAsset').returns(mockTask);

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
    const promise = createScoreAssetForStateBasedDisaster(testData, mapBoundsCallback);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(exportStub).to.be.calledOnce;
          expect(taskStartStub).to.be.calledOnce;
          expect(renameStub).to.be.calledOnce;
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
        {sw: {lng: 0.4, lat: 0.5}, ne: {lng: 10, lat: 12}});
  });

  it('Test with no damage asset', () => {
    testData.asset_data.damage_asset_path = null;
    const expectedLatLngBounds = {
      sw: {lng: 0.39, lat: 0.49},
      ne: {lng: 13, lat: 11},
    };
    setScoreBoundsCoordinates();

    const {boundsPromise, mapBoundsCallback} =
        makeCallbackForTextAndPromise('Found bounds');
    const promise = createScoreAssetForStateBasedDisaster(testData, mapBoundsCallback);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(taskStartStub).to.be.calledOnce;
          return convertEeObjectToPromise(exportStub.firstCall.args[0]);
        })
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(1);
          const feature = features[0];
          expect(feature.properties).to.eql({
            'BLOCK GROUP': 'Some state, group 361',
            'BUILDING COUNT': 3,
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

  it('handles non-numeric median income valuess', () => {
    testData.asset_data.income_asset_paths.NY = ee.FeatureCollection(
        [makeIncomeGroup('360', '250,000+'), makeIncomeGroup('361', '-')]);
    testData.asset_data.snap_data.paths.NY = ee.FeatureCollection(
        [makeSnapGroup('360', 10, 15), makeSnapGroup('361', 10, 15)]);
    const promise = createScoreAssetForStateBasedDisaster(testData);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(taskStartStub).to.be.calledOnce;
          return convertEeObjectToPromise(
              exportStub.firstCall.args[0].sort('GEOID'));
        })
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(2);
          expect(features[0]['properties']['MEDIAN INCOME']).to.equal(250000);
          expect(features[1]['properties']['MEDIAN INCOME']).to.be.undefined;
        });
  });

  it('handles no svi/income assets', () => {
    testData.asset_data.income_asset_paths = {};
    testData.asset_data.svi_asset_paths = {};
    const promise = createScoreAssetForStateBasedDisaster(testData);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(taskStartStub).to.be.calledOnce;
          return convertEeObjectToPromise(exportStub.firstCall.args[0]);
        })
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(1);
          expect(features[0]['properties']['MEDIAN INCOME']).to.be.undefined;
          expect(features[0]['properties']['SVI']).to.be.undefined;
        });
  });

  it('handles no buildings asset when damage missing', () => {
    testData.asset_data.building_asset_paths = {};
    testData.asset_data.damage_asset_path = null;
    setScoreBoundsCoordinates();
    const promise = createScoreAssetForStateBasedDisaster(testData);
    expect(promise).to.not.be.null;
    cy.wrap(promise)
        .then(() => {
          expect(taskStartStub).to.be.calledOnce;
          return convertEeObjectToPromise(exportStub.firstCall.args[0]);
        })
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(1);
          expect(features[0]['properties']['BUILDING COUNT']).to.be.undefined;
        });
  });

  it('Main score asset not present', () => {
    // Make things more realistic by specifying a missing main asset path.
    cy.stub(Resources, 'getScoreAssetPath')
        .returns(gdEePathPrefix + 'path/that/does/not/exist');
    const deleteStub = cy.stub(ee.data, 'deleteAsset');
    renameStub.restore();
    cy.wrap(backUpAssetAndStartTask(null)).then(() => {
      expect(deleteStub).to.not.be.called;
      expect(exportStub).to.be.calledOnce;
      expect(taskStartStub).to.be.calledOnce;
    });
  });

  it('Backup score asset present', () => {
    const deleteStub =
        cy.stub(ee.data, 'deleteAsset').callsFake((oldAsset, callback) => {
          expect(oldAsset).to.equal(Resources.getBackupScoreAssetPath());
          callback();
        });
    renameStub.onCall(0).callsFake((from, to, callback) => {
      expect(from).to.equal(Resources.getScoreAssetPath());
      expect(to).to.equal(Resources.getBackupScoreAssetPath());
      callback(
          null,
          'Cannot overwrite asset \'' + Resources.getBackupScoreAssetPath() +
              '\'');
    });
    renameStub.onCall(1).callsFake((from, to, callback) => {
      expect(from).to.equal(Resources.getScoreAssetPath());
      expect(to).to.equal(Resources.getBackupScoreAssetPath());
      callback();
    });
    cy.wrap(backUpAssetAndStartTask(null)).then(() => {
      expect(renameStub).to.be.calledTwice;
      expect(deleteStub).to.be.calledOnce;
      expect(exportStub).to.be.calledOnce;
      expect(taskStartStub).to.be.calledOnce;
    });
  });

  it('Could not delete backup', () => {
    // Make things more realistic by trying to delete an asset that we don't
    // control.
    cy.stub(Resources, 'getBackupScoreAssetPath').returns('TIGER/2018/States');
    const renameError = 'Cannot overwrite asset \'' +
        Resources.getBackupScoreAssetPath() + '\'';
    renameStub.callsFake((from, to, callback) => {
      expect(from).to.equal(Resources.getScoreAssetPath());
      expect(to).to.equal(Resources.getBackupScoreAssetPath());
      callback(null, renameError);
    });
    const promise = backUpAssetAndStartTask(null).then(
        () => assert.fail(null, null, 'Should have failed'),
        (err) => expect(err).to.equal(
            'Error moving old score asset: ' + renameError));
    cy.wrap(promise).then(() => {
      expect(renameStub).to.be.calledOnce;
      expect(exportStub).to.be.calledOnce;
      expect(taskStartStub).to.not.be.called;
    });
  });

  /** Sets `asset_data.score_bounds_coordinates` to a square. */
  function setScoreBoundsCoordinates() {
    testData.asset_data.score_bounds_coordinates = [
      createGeoPoint(0.39, 0.49),
      createGeoPoint(13, 0.49),
      createGeoPoint(13, 11),
      createGeoPoint(0.39, 11),
    ];
  }
});

/**
 * Makes a NY Census block group that is a 1x2 rectangle, with southwest corner
 * (swLng, 0), and block group id given by swLng.
 * @param {number} swLng
 * @return {ee.Feature}
 */
function makeCensusBlockGroup(swLng) {
  return ee.Feature(
      ee.Geometry.Rectangle([swLng, 0, swLng + 1, 2]), {GEOID: '36' + swLng});
}

/**
 * Makes a feature with a single point.
 * @param {number} lng
 * @param {number} lat
 * @return {ee.Feature}
 */
function makePoint(lng, lat) {
  return ee.Feature(ee.Geometry.Point([lng, lat]));
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
 * @param {number} lng
 * @param {number} lat
 * @return {firebase.firestore.GeoPoint}
 */
function createGeoPoint(lng, lat) {
  return new firebase.firestore.GeoPoint(lat, lng);
}

/**
 * Creates a callback for use with {@link createScoreAssetForStateBasedDisaster} so that we will be
 * informed when the Firestore write of the map bounds has completed. Returns a
 * Promise that can be waited on for that write to complete.
 * @return {{boundsPromise: Promise, mapBoundsCallback: Function}}
 */
function makeCallbackForTextAndPromise() {
  let resolveFunction = null;
  const boundsPromise = new Promise((resolve) => resolveFunction = resolve);
  const mapBoundsCallback = (message) => {
    if (message.includes('Found bounds')) {
      resolveFunction();
    }
  };
  return {boundsPromise, mapBoundsCallback};
}
