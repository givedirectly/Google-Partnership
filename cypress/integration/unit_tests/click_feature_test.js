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
import {blockGroupTag} from '../../../docs/property_names';
import {currentFeatures} from '../../../docs/highlight_features';

describe('Unit tests for click_feature.js with map and table', () => {
  loadScriptsBeforeForUnitTests('ee', 'charts', 'maps');

  beforeEach(() => {
    currentFeatures.clear();
  });

  it('clicks on a feature on the map, then unclicks it', () => {
    setUpMapAndClickOnFeature();
    cy.wait(100);
    cy.get('#test-map-div').click(500, 100);
    assertNoSelection();
  });

  it('clicks on a feature on the map, then clicks on another', () => {
    setUpMapAndClickOnFeature();
    cy.wait(100);
    cy.get('#test-map-div').click(800, 200);
    cy.get('#test-map-div').should('contain', 'SCORE: 3');
    cy.get('#test-map-div').should('contain', 'another group');
  });

  it('click highlights correct feature even after resort', () => {
    setUpPage();
    // Sort descending by damage percentage
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();
    clickAndVerifyBlockGroup();
  });

  it('clicks a place where there is no damage -> no feature', () => {
    setUpPage();
    cy.get('#test-map-div').click(900, 100);
    assertNoSelection();
  });
});

function setUpMapAndClickOnFeature() {
  setUpPage();
  clickAndVerifyBlockGroup();
}

function setUpPage() {
  const feature1 = createFeatureFromCorners(0.25, 0.25, 0.75, 1).set(blockGroupTag, 'my block group');
  const feature2 = createFeatureFromCorners(0.75, 0.25, 1.5, 0.75).set(blockGroupTag, 'another group');
  const offMapFeature = createFeatureFromCorners(10, 10, 20, 20);
  const otherFeature = createFeatureFromCorners(-11, -11, -10, -10);
  const features = ee.FeatureCollection([feature1, feature2, offMapFeature, otherFeature]);
  const scoredFeatures = ee.FeatureCollection([feature1.set(scoreTag, 1), feature2.set(scoreTag, 3), offMapFeature.set(scoreTag, 2), otherFeature.set(scoreTag, 0)]);
  let map;
  const loadingFinishedPromise = new Promise((resolve) => {
    loading.loadingElementFinished = (id) => {
      if (id === tableContainerId) resolve();
    }
  });
  createGoogleMap().then((mapResult) => map = mapResult)
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
    drawTableAndSetUpHandlers(convertEeObjectToPromise(scoredFeatures).then((fc) => fc.features), map, features);
  });
  cy.wrap(loadingFinishedPromise);
  return assertNoSelection();
}

function clickAndVerifyBlockGroup() {
  cy.get('#test-map-div').click(0, 0);
  cy.get('#test-map-div').should('contain', 'SCORE: 1');
  cy.get('#test-map-div').should('contain', 'my block group');
  return cy.get('.google-visualization-table-tr-sel')
      .find('[class="google-visualization-table-td"]')
      .should(
          'have.text',
          'my block group');
}

function assertNoSelection() {
  cy.get('#test-map-div').should('not.contain', 'SCORE:');
  return cy.get('.google-visualization-table-tr-sel').should('not.exist');
}

function createFeatureFromCorners(west, south, east, north) {
  return createFeature(west, south, west, north, east, north, east, south);
}

function createFeature(...polygonCoordinates) {
  let result = ee.Feature(ee.Geometry.Polygon(...polygonCoordinates));
  for (let i = 0; i < tableHeadings.length; i++) {
    result = result.set(tableHeadings[i], polygonCoordinates[i % polygonCoordinates.length]);
  }
  return result;
}
