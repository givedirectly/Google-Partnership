import {run} from '../../../docs/import/import_data';
import {convertEeObjectToPromise} from '../../../docs/map_util';
import {assertFirestoreMapBounds} from '../../support/firestore_map_bounds';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

describe('Unit tests for import_data.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let testData;
  let exportStub;
  beforeEach(() => {
    // Create a pretty trivial world: 4 blocks, each 1x1.
    const tigerBlocks = ee.FeatureCollection([
      makeCensusBlock(0, 0),
      makeCensusBlock(0, 1),
      makeCensusBlock(1, 0),
      makeCensusBlock(1, 1),
    ]);
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
        block_data: {
          path: tigerBlocks,
          state_key: 'statefp10',
          blockid_key: 'blockid10',
          blockonly_key: 'blockce',
        },
        snap_data: {
          paths: {
            NY: snapData,
          },
          snap_key: 'HD01_VD02',
          total_key: 'HD01_VD01',
        },
        svi_asset_paths: {
          NY: sviData,
        },
        svi_key: 'RPL_THEMES',
        income_asset_paths: {
          NY: incomeData,
        },
        income_key: 'HD01_VD01',
        building_asset_paths: {
          NY: buildingsCollection,
        }
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
        {sw: {lng: 0.39, lat: 0.49}, ne: {lng: 10.01, lat: 12.01}});
  });

  it('Test with no damage asset', () => {
    testData.asset_data.damage_asset_path = null;
    testData.asset_data.map_bounds_sw = '0.49, 0.39';
    testData.asset_data.map_bounds_ne = '11, 13';

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
    assertFirestoreMapBounds(
        {sw: {lng: 0.39, lat: 0.49}, ne: {lng: 13, lat: 11}});
  });
});

/**
 * Makes a census block in NY that is a 1x1 square, with southwest corner given
 * by the coordinates and a block id derived from the given coordinates.
 * @param {number} swLng
 * @param {number} swLat
 * @return {ee.Feature}
 */
function makeCensusBlock(swLng, swLat) {
  const blockce = swLng + '' + swLat;
  const statefp10 = '36';
  const blockid10 = statefp10 + blockce;
  return ee.Feature(
      ee.Geometry.Polygon([
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
      ]),
      {statefp10, blockce, blockid10});
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
    'HD01_VD02': snap,
    'HD01_VD01': total,
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
  return ee.Feature(null, {'RPL_THEMES': svi, 'FIPS': '36'});
}

/**
 * Makes a fake Census block group for the income FeatureCollection.
 * @param {string} id Block group geoid
 * @param {number} income Average income of group
 * @return {ee.Feature}
 */
function makeIncomeGroup(id, income) {
  return ee.Feature(null, {HD01_VD01: income, GEOid2: id});
}
