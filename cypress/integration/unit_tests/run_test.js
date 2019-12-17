import {mapContainerId, tableContainerId} from '../../../docs/dom_constants.js';
import {createScorePromise, run} from '../../../docs/run.js';
import * as Update from '../../../docs/update.js';
import * as PolygonDraw from '../../../docs/polygon_draw.js';
import * as LayerUtil from '../../../docs/layer_util.js';
import * as ProcessJoinedData from '../../../docs/process_joined_data.js';
import * as DrawTable from '../../../docs/draw_table.js';
import * as Loading from '../../../docs/loading.js';
import * as ClickFeature from '../../../docs/click_feature.js';
import * as Resources from '../../../docs/resources.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import SettablePromise from '../../../docs/settable_promise.js';

describe('Unit test for run.js', () => {
  loadScriptsBeforeForUnitTests('ee', 'deck', 'maps');
  xit('Score asset not present, but backup is', () => {
    cy.stub(Update, 'createToggles');
    cy.stub(PolygonDraw, 'initializeAndProcessUserRegions');
    cy.stub(LayerUtil, 'setMapToDrawLayersOn');
    cy.stub(ProcessJoinedData, 'processJoinedData').
        callsFake((promise) => promise);
    cy.stub(LayerUtil, 'addScoreLayer');
    const promiseGivenToDrawTable = new SettablePromise();
    cy.stub(DrawTable, 'drawTable').callsFake((promise) => {
      promiseGivenToDrawTable.setPromise(promise);
      return promiseGivenToDrawTable;
    });
    cy.stub(Loading, 'addLoadingElement');
    cy.stub(ClickFeature, 'selectHighlightedFeatures');
    cy.stub(Resources, 'getScoreAsset').
        returns('nonexistent/feature/collection');
    cy.stub(Resources, 'getBackupScoreAsset').
        returns(ee.FeatureCollection(
            [ee.Feature(ee.Geometry.Point([0, 0]), {property: 'value'})]));
    cy.stub(Loading, 'loadingElementFinished');
    const fakeMap = {
      addListener: () => {
      }, data: {
        addListener: () => {
        }
      }
    };
    run(null, null, new Promise(() => {
    }));
    cy.wrap(promiseGivenToDrawTable.getPromise()).then((result) => {
      expect(result.features).to.have.length(1);
      expect(result.features[0].properties).
          to.
          have.
          property('property', 'value');
    });
  });

  it('Score asset not present, but backup is', () => {
    cy.stub(Resources, 'getScoreAsset').
        returns('nonexistent/feature/collection');
    cy.stub(Resources, 'getBackupScoreAsset').
        returns(ee.FeatureCollection(
            [ee.Feature(ee.Geometry.Point([0, 0]), {property: 'value'})]));
    cy.wrap(createScorePromise()).then(console.log);
  });
});