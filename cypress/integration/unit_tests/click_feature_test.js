import {tableContainerId} from '../../../docs/dom_constants.js';
import {tableHeadings} from '../../../docs/draw_table.js';
import {currentFeatures} from '../../../docs/highlight_features';
import * as loading from '../../../docs/loading.js';
import * as MapUtil from '../../../docs/map_util.js';
import {convertEeObjectToPromise} from '../../../docs/map_util.js';
import {blockGroupTag, geoidTag} from '../../../docs/property_names';
import {scoreTag} from '../../../docs/property_names.js';
import * as Resources from '../../../docs/resources.js';
import {drawTableAndSetUpHandlers, setScorePromises} from '../../../docs/run.js';
import {cyQueue} from '../../support/commands.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import {convertPathToLatLng, createGoogleMap} from '../../support/test_map.js';

// Clicks on the map can sometimes happen too fast for the map to react.
const waitBeforeClick = 500;
const feature1Corners = [0.25, 0.25, 0.75, 1];
const feature2Corners = [0.75, 0.25, 1.5, 0.75];
const zeroScoreCorners = [0, 0, 0.25, 0.25];
const missingPropertiesCorners = [-0.25, -0.25, 0, 0];


describe('Unit tests for click_feature.js with map and table', () => {
  loadScriptsBeforeForUnitTests('ee', 'charts', 'maps');

  let features;
  let scoredFeatures;
  let map;

  before(() => {
    const feature1 = createFeatureFromCorners(...feature1Corners)
                         .set(blockGroupTag, 'my block group');
    const feature2 = createFeatureFromCorners(...feature2Corners)
                         .set(blockGroupTag, 'another group');
    const offMapFeature = createFeatureFromCorners(10, 10, 20, 20);
    const zeroFeature = createFeatureFromCorners(...zeroScoreCorners)
                            .set(blockGroupTag, 'zero group');
    const missingPropertiesFeature =
        createFeatureWithOnlyGeoid(...missingPropertiesCorners)
            .set(blockGroupTag, 'missing properties group');
    features = ee.FeatureCollection([
      feature1,
      feature2,
      offMapFeature,
      zeroFeature,
      missingPropertiesFeature,
    ]);
    scoredFeatures = ee.FeatureCollection([
      feature1.set(scoreTag, 1),
      feature2.set(scoreTag, 3),
      offMapFeature.set(scoreTag, 2),
      zeroFeature.set(scoreTag, 0),
      missingPropertiesFeature.set(scoreTag, 4),
    ]);
  });

  beforeEach(() => {
    currentFeatures.clear();
    setUpPage();
    cy.stub(Resources, 'getScoreAssetPath').returns(features);
    const oldConvertToPromise = MapUtil.convertEeObjectToPromise;
    MapUtil.convertEeObjectToPromise = (eeObject) => {
      MapUtil.convertEeObjectToPromise = oldConvertToPromise;
      const result = MapUtil.convertEeObjectToPromise(eeObject);
      return result.then((obj) => {
        obj.id = eeObject;
        return obj;
      });
    };
    setScorePromises();
  });

  /**
   * Sets up map and table by calling real setup functions, but with our toy
   * EE features.
   * @return {Cypress.Chainable}
   */
  function setUpPage() {
    const loadingFinishedPromise =
        new Promise((resolve) => loading.loadingElementFinished = (id) => {
          if (id === tableContainerId) resolve();
        });
    createGoogleMap().then((mapResult) => map = mapResult);
    cy.document().then((doc) => {
      // Lightly fake out prod document access.
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
      drawTableAndSetUpHandlers(
          convertEeObjectToPromise(scoredFeatures).then((fc) => fc.features),
          map);
    });
    cy.wrap(loadingFinishedPromise);
    return assertNoSelection();
  }

  it('clicks on a feature on the map, then unclicks it', () => {
    clickAndVerifyBlockGroup();
    cy.wait(waitBeforeClick);
    cy.get('#test-map-div').click(500, 100);
    assertNoSelection();
  });

  it('clicks on a feature on the map, then clicks on another', () => {
    clickAndVerifyBlockGroup();
    cy.wait(waitBeforeClick);
    cy.get('#test-map-div').click(800, 200);
    cy.get('#test-map-div').should('contain', 'SCORE: 3');
    cy.get('#test-map-div').should('contain', 'another group');
    assertFeatureShownOnMap(feature2Corners);
  });

  it('click highlights correct feature even after resort', () => {
    // Sort descending by damage percentage
    cy.get('.table-header > :nth-child(4)').click();
    cy.get('.table-header > :nth-child(4)').click();
    clickAndVerifyBlockGroup();
  });

  it('clicks a place where there is no damage -> no feature', () => {
    cy.get('#test-map-div').click(900, 100);
    assertNoSelection();
  });

  it('clicks on a feature not in the list', () => {
    cy.wait(waitBeforeClick);
    cy.get('#test-map-div').click(350, 400);
    cy.get('.google-visualization-table-tr-sel').should('not.exist');
    cy.get('#test-map-div').should('contain', 'SCORE: 0');
    cy.get('#test-map-div').should('contain', 'zero group');
    assertFeatureShownOnMap(zeroScoreCorners);
  });

  it('clicks on a feature with missing properties', () => {
    cy.wait(waitBeforeClick);
    cy.get('#test-map-div').click(250, 500);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should('have.text', 'missing properties group');
    assertFeatureShownOnMap(missingPropertiesCorners);
    cy.get('#test-map-div').should('contain', 'SCORE: 4');
    cy.get('#test-map-div').should('contain', 'missing properties group');
    cy.get('#test-map-div').should('contain', 'SVI: undefined');
    cy.get('#test-map-div').should('contain', 'MEDIAN INCOME: undefined');
    cy.get('#test-map-div').should('contain', 'BUILDING COUNT: undefined');
  });

  /**
   * Asserts that there is currently no pop-up on the map or selected row in the
   * table.
   * @return {Cypress.Chainable}
   */
  function assertNoSelection() {
    cy.get('#test-map-div').should('not.contain', 'SCORE:');
    getDataFeatures().then((features) => expect(features).to.be.empty);
    return cy.get('.google-visualization-table-tr-sel').should('not.exist');
  }

  /**
   * Gets all features currently displayed on map.
   * @return {Cypress.Chainable<Array<google.maps.Data.Feature>>}
   */
  function getDataFeatures() {
    return cyQueue(() => {
      const features = [];
      map.data.forEach((feature) => features.push(feature));
      return features;
    });
  }

  /**
   * Clicks on the map to pop up feature1 and asserts presence.
   * @return {Cypress.Chainable}
   */
  function clickAndVerifyBlockGroup() {
    cy.get('#test-map-div').click(0, 0);
    cy.get('#test-map-div').should('contain', 'SCORE: 1');
    cy.get('#test-map-div').should('contain', 'my block group');
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should('have.text', 'my block group');
    return assertFeatureShownOnMap(feature1Corners);
  }

  /**
   * Asserts that there is exactly one feature on the map, and that it has the
   * given geometry.
   * @param {Array<number>} expectedFeatureCorners The expected coordinates of
   *     the feature, in the same form as {@link createFeatureFromCorners}
   * @return {Cypress.Chainable}
   */
  function assertFeatureShownOnMap(expectedFeatureCorners) {
    return getDataFeatures().then((features) => {
      expect(features).to.have.length(1);
      const feature = features[0];
      expect(feature.getGeometry()).to.not.be.null;
      const rings = feature.getGeometry().getArray();
      expect(rings).to.have.length(1);
      // chai is bad at equality on google.maps.LatLng objects, so convert.
      const coordinates = convertPathToLatLng(rings[0]);
      const expected = [
        {
          lng: expectedFeatureCorners[0],
          lat: expectedFeatureCorners[1],
        },
        {
          lng: expectedFeatureCorners[2],
          lat: expectedFeatureCorners[1],
        },
        {
          lng: expectedFeatureCorners[2],
          lat: expectedFeatureCorners[3],
        },
        {
          lng: expectedFeatureCorners[0],
          lat: expectedFeatureCorners[3],
        },
      ];
      expect(coordinates).to.eql(expected);
    });
  }
});

/**
 * Creates a rectangular test feature, with only the geoid filled in.
 * @param {number} west West-most (smallest longitude) coordinate of feature
 * @param {number} south South-most (smallest latitude) coordinate of feature
 * @param {number} east East-most (largest longitude) coordinate of feature
 * @param {number} north North-most (largest latitude) coordinate of feature
 * @return {ee.Feature}
 */
function createFeatureWithOnlyGeoid(west, south, east, north) {
  return ee
      .Feature(ee.Geometry.Polygon(
          [west, south, west, north, east, north, east, south]))
      .set(geoidTag, west);
}

/**
 * Creates a rectangular test feature, with fixed properties filled in.
 * @param {number} west West-most (smallest longitude) coordinate of feature
 * @param {number} south South-most (smallest latitude) coordinate of feature
 * @param {number} east East-most (largest longitude) coordinate of feature
 * @param {number} north North-most (largest latitude) coordinate of feature
 * @return {ee.Feature}
 */
function createFeatureFromCorners(west, south, east, north) {
  let result = createFeatureWithOnlyGeoid(west, south, east, north);
  for (let i = 1; i < tableHeadings.length; i++) {
    result = result.set(tableHeadings[i], 100 * i);
  }
  return result;
}
