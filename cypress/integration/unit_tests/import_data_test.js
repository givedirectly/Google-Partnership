import {run} from '../../../docs/import/import_data';
import {convertEeObjectToPromise} from '../../../docs/map_util';
import {assertFirestoreMapBounds} from '../../support/firestore_map_bounds';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

describe('Unit tests for import_data.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let testData;
  let exportStub;
  beforeEach(() => {
    // Create a pretty trivial world: 4 blocks, each 1x1, block groups are
    // vertical stripes. Under the covers, we scale all dimensions down because
    // production code creates an "envelope" 1 km wide around damage, and that
    // envelope is assumed to fully contain any block group that has any damage.
    // TODO(janakr): delete if not using blocks for block group calculations.
    // const tigerBlocks = ee.FeatureCollection([
    //   makeCensusBlock(0, 0),
    //   makeCensusBlock(0, 1),
    //   makeCensusBlock(1, 0),
    //   makeCensusBlock(1, 1),
    // ]);
    const tigerBlockGroups = ee.FeatureCollection(
        [makeCensusBlockGroup(0), makeCensusBlockGroup(1)]);
    // Three damage points, one of them outside the blocks, just for fun.
    // Relevant damage points are in SW and SE blocks.
    const damageData = ee.FeatureCollection(
        [makePoint(0.4, 0.5), makePoint(1.5, .5), makePoint(10, 12)]);
    // Only one SNAP block group, corresponding to western blocks.
    const snapData = ee.FeatureCollection([makeSnapGroup('361', 10, 15)]);
    // One SVI tract, encompassing the whole state.
    const sviData = ee.FeatureCollection([makeSviTract(0.5)]);
    // One income block group, also western blocks.
    const incomeData = ee.FeatureCollection([makeIncomeGroup('361', 37)]);
    // Four buildings, three of which are in our block group.
    const buildingsCollection = ee.FeatureCollection([
      makePoint(0.1, 0.9),
      makePoint(1.2, 0.5),
      makePoint(1.4, 0.7),
      makePoint(1.5, 0.5),
    ]);
    // Stub out delete and export. We'll assert on what was exported, below.
    cy.stub(ee.data, 'deleteAsset');
    exportStub = cy.stub(ee.batch.Export.table, 'toAsset')
                     .returns({start: () => {}, id: 'FAKE_ID'});

    // Test data is reasonably real. All of the keys should be able to vary,
    // with corresponding changes to test data (but no production changes). The
    // state must be real.
    testData = {
      states: ['NY'],
      asset_data: {
        damage_asset_path: damageData,
        block_group_asset_paths: {
          NY: tigerBlockGroups,
        },
        // TODO(janakr): delete if not using blocks for block group calculation.
        // block_data: {
        //   path: tigerBlocks,
        //   state_key: 'testStateKey',
        //   blockid_key: 'testBlockidKey',
        //   blockonly_key: 'testBlockTabNumberKey',
        // },
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
    expect(run(testData)).to.be.true;
    expect(exportStub).to.be.calledOnce;
    cy.wrap(convertEeObjectToPromise(exportStub.firstCall.args[0]))
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

    expect(run(testData)).to.be.true;
    expect(exportStub).to.be.calledOnce;
    cy.wrap(convertEeObjectToPromise(exportStub.firstCall.args[0]))
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
    assertFirestoreMapBounds(expectedLatLngBounds);
  });
});

// Make sure that our block groups aren't so big they escape the 1 km damage
// envelope. 1 degree of longitude is 111 km at the equator, so this should be
// plenty.
const distanceScalingFactor = 0.0001;

// TODO(janakr): delete if not using blocks for block group calculations.
/**
 * Makes a census block in NY that is a 1x1 square, with southwest corner given
 * by the coordinates and a block id derived from the given coordinates.
 * @param {number} swLng
 * @param {number} swLat
 * @return {ee.Feature}
 */
function makeCensusBlock(swLng, swLat) {
  const testBlockTabNumberKey = swLng + '' + swLat;
  const testStateKey = '36';
  const testBlockidKey = testStateKey + testBlockTabNumberKey;
  return ee.Feature(
      ee.Geometry.Polygon(scaleArray([
        swLng,
        swLat,
        swLng + 1,
        swLat,
        swLng + 1,
        swLat + 1,
        swLng,
        swLat + 1,
        swLng,
        swLat,
      ])),
      {testStateKey, testBlockTabNumberKey, testBlockidKey});
}

function makeCensusBlockGroup(swLng) {
  return ee.Feature(
      ee.Geometry.Rectangle(scaleArray([swLng, 0, swLng + 1, 2])),
      {GEOID: '36' + swLng})
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
 * @returns {Array<number>} The scaled array
 */
function scaleArray(array) {
  return array.map((num) => num * distanceScalingFactor);
}

/**
 * Scales the given object's numerical entries by {@link distanceScalingFactor}.
 * @param {Object} object LatLngBounds or a sub-object of that. Nothing complex!
 * @returns {Object} The scaled object
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