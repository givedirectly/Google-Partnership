import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';
import {run} from '../../../docs/import/import_data';
import {convertEeObjectToPromise} from "../../../docs/map_util";

describe('Unit tests for import_data.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let testData;
  let exportStub;
  before(() => {
    const tigerBlocks = ee.FeatureCollection([makeCensusBlock(0, 0),
    makeCensusBlock(0, 1), makeCensusBlock(1, 0),
    makeCensusBlock(1, 1)]);
    const damageData = ee.FeatureCollection([makePoint(0.5, 0.5),
    makePoint(1.5, .5), makePoint(10, 10)]);
    const snapData = ee.FeatureCollection([makeSnapGroup(1, 10, 15)]);
    const sviData = ee.FeatureCollection([makeSviTract(1, 0.5)]);
    const incomeData = ee.FeatureCollection([makeIncomeGroup(1, 37)]);
    cy.stub(ee.data, 'deleteAsset');
    exportStub = cy.stub(ee.batch.Export.table, 'toAsset').returns({start: () => {}, id: 'FAKE_ID'});

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
      },
    };
    const buildingsCollection = ee.FeatureCollection([makePoint(0.1, 0.9),
      makePoint(1.2, 0.5), makePoint(1.4, 0.7),
        makePoint(1.5, 0.5)
    ]);
    const oldFeatureCollectionMethod = ee.FeatureCollection;
    const stubFunction = (...params) => {
      if (params[0] === 'users/gd/states/NY/buildings') {
        ee.FeatureCollection = oldFeatureCollectionMethod;
        return buildingsCollection;
      }
      ee.FeatureCollection = oldFeatureCollectionMethod;
      const result = ee.FeatureCollection(...params);
      ee.FeatureCollection = stubFunction;
      return result;
    };
    ee.FeatureCollection = stubFunction;
  });
  it('Basic test', () => {
    run(testData);
    expect(exportStub).to.be.calledOnce;
    cy.wrap(convertEeObjectToPromise(exportStub.firstCall.args[0]))
        .then((result) => {
          const features = result.features;
          expect(features).to.have.length(1);
          const feature = features[0];
          expect(feature.properties).to.eql({
            'BLOCK GROUP': 'NY, group 1',
            'BUILDING COUNT': 3,
            'DAMAGE PERCENTAGE': 0.3333333333333333,
            'GEOID': "361",
            'MEDIAN INCOME': 37,
            'SNAP HOUSEHOLDS': 10,
            'SNAP PERCENTAGE': 0.6666666666666666,
            'SVI': 0.5,
            'TOTAL HOUSEHOLDS': 15,
          });
        });
  });
});

function makeCensusBlock(swLng, swLat) {
  const blockce = swLng + '' + swLat;
  const statefp10 = '36';
  const blockid10 = statefp10 + blockce;
  return ee.Feature(ee.Geometry.Polygon([swLng, swLat, swLng + 1, swLat, swLng + 1, swLat + 1,
  swLng, swLat + 1, swLng, swLat]), {statefp10, blockce, blockid10});
}

function makePoint(lng, lat) {
  return ee.Feature(ee.Geometry.Point([lng, lat]));
}

function makeSnapGroup(id, snap, total) {
  return ee.Feature(null, {HD01_VD02: snap, HD01_VD01: total,
    'GEOdisplay-label': 'NY, group ' + id,
    GEOid2: '36' + id});
}

function makeSviTract(swLng, svi) {
  // One SVI tract per state, eh.
  return ee.Feature(null, {'RPL_THEMES': svi, 'FIPS': '36'});
}

function makeIncomeGroup(id, income) {
  return ee.Feature(null, {HD01_VD01: income,
    GEOid2: '36' + id});
}