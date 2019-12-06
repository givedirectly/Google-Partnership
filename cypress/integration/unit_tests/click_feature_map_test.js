import {tableHeadings} from '../../../docs/draw_table.js';
import {convertEeObjectToPromise} from '../../../docs/map_util.js';
import {
  blockGroupTag, buildingCountTag, damageTag,
  geoidTag, incomeTag, scoreTag,
  snapPercentageTag, sviTag, totalPopTag
} from '../../../docs/property_names.js';
import {
  addClickFeatureListener,
  drawTableAndSetUpHandlers
} from '../../../docs/run.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import {createGoogleMap} from '../../support/test_map.js';

describe('Unit test for click_feature.js with map', () => {
  loadScriptsBeforeForUnitTests('ee', 'charts', 'maps');

  it('clicks on map', () => {
    const feature1 = createFeatureFromCorners(-10, -10, 10, 10);
    const otherFeature = createFeatureFromCorners(-11, -11, -10, -10);
    const features = ee.FeatureCollection([feature1, otherFeature]);
    const scoredFeatures = features.map((f) => f.set(scoreTag, ee.Number(f.get(geoidTag)).eq(-10)));
    let map;
    createGoogleMap().then((mapResult) => map = mapResult);
    cy.document().then((doc) => {
      const containerDiv = doc.createElement('div');
      containerDiv.id = 'tableContainer';
      doc.body.appendChild(containerDiv);
      const tableDiv = doc.createElement('div');
      tableDiv.id = 'table';
      containerDiv.appendChild(tableDiv);
      // Lightly fake out prod
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      drawTableAndSetUpHandlers(convertEeObjectToPromise(scoredFeatures).then((fc) => fc.features), map, features);
    });
    cy.get('#test-map-div').click(0, 1);

  })
});

function createFeatureFromCorners(west, south, east, north) {
  return createFeature(west, south, west, north, east, north, east, south);
}

function createFeature(...polygonCoordinates) {
  let result = ee.Feature(ee.Geometry.Polygon(...polygonCoordinates));
  for (let i = 0; i < tableHeadings.length; i++) {
    result = result.set(tableHeadings[i], polygonCoordinates[i]);
  }
  return result;
}
