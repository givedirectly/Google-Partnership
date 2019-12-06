import {tableContainerId} from '../../../docs/dom_constants.js';
import {tableHeadings} from '../../../docs/draw_table.js';
import {convertEeObjectToPromise} from '../../../docs/map_util.js';
import {
  geoidTag, scoreTag
} from '../../../docs/property_names.js';
import {
  drawTableAndSetUpHandlers
} from '../../../docs/run.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import {createGoogleMap} from '../../support/test_map.js';
import * as loading from '../../../docs/loading.js'

describe('Unit test for click_feature.js with map', () => {
  loadScriptsBeforeForUnitTests('ee', 'charts', 'maps');

  it('clicks on map', () => {
    const feature1 = createFeatureFromCorners(-10, -10, 10, 10);
    const otherFeature = createFeatureFromCorners(-11, -11, -10, -10);
    const features = ee.FeatureCollection([feature1, otherFeature]);
    let map;
    const loadingFinishedPromise = new Promise((resolve) => {
      loading.loadingElementFinished = (id) => {
        if (id === tableContainerId) resolve();
      }
    });
    createGoogleMap().then((mapResult) => map = mapResult);
    cy.document().then((doc) => {
      // Lightly fake out prod
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      cy.stub(document, 'createElement')
          .callsFake((tag) => doc.createElement(tag));
      const containerDiv = doc.createElement('div');
      containerDiv.id = 'tableContainer';
      doc.body.appendChild(containerDiv);
      const tableDiv = doc.createElement('div');
      tableDiv.id = 'table';
      containerDiv.appendChild(tableDiv);
      drawTableAndSetUpHandlers(Promise.resolve(scoreResult), map, features);
    });
    cy.wrap(loadingFinishedPromise);
    cy.get('#test-map-div').click(0, 1);
    cy.get('#test-map-div').should('contain', 'SCORE: 1');
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

const scoreResult = [{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]]]},"id":"0","properties":{"BLOCK GROUP":-10,"BUILDING COUNT":10,"DAMAGE PERCENTAGE":10,"GEOID":-10,"SCORE":1,"SNAP PERCENTAGE":10,"SVI":-10,"TOTAL HOUSEHOLDS":10}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-11,-11],[-10,-11],[-10,-10],[-11,-10],[-11,-11]]]},"id":"1","properties":{"BLOCK GROUP":-11,"BUILDING COUNT":-10,"DAMAGE PERCENTAGE":-10,"GEOID":-11,"SCORE":0,"SNAP PERCENTAGE":-10,"SVI":-11,"TOTAL HOUSEHOLDS":-10}}];
