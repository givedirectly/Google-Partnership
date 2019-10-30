import {clickFeature} from '../../../docs/click_feature.js';
import {tableHeadings} from '../../../docs/draw_table.js';
import * as HighlightFeatures from '../../../docs/highlight_features.js';
import {loadScriptsBefore} from '../../support/script_loader';

let mockTable;
let tableApi;

describe('Unit test for click_feature.js', () => {
  loadScriptsBefore('ee');
  beforeEach(() => {
    HighlightFeatures.CurrentFeaturesValue = () => new MockValue();
    /** Very real fake of the CurrentFeaturesValue class */
    class MockValue {
      /**
       * @constructor
       * @param {Array} dataFeatures
       */
      constructor(dataFeatures) {
        this.dataFeatures = dataFeatures;
      }

      /**
       * Stores a related popup object.
       * @param {Object} popup
       */
      setPopup(popup) {
        this.popup = popup;
      }
    }

    cy.stub(HighlightFeatures, 'highlightFeatures', (features, map) => {
      if (features.length === 0) {
        HighlightFeatures.currentFeatures.clear();
      } else {
        HighlightFeatures.currentFeatures.set(
            0, new HighlightFeatures.CurrentFeaturesValue());
      }
    });

    tableApi = {
      setSelection: (selection) => {},
    };
    mockTable = Cypress.sinon.mock(tableApi);
    HighlightFeatures.currentFeatures.clear();
    const
  });

  it('clicks on a block group in the list', () => {
    const tableData = [tableHeadings, [0, 99, 0.46, 0.52]];
    mockTable.expects('setSelection').once().withArgs([{row: 0, column: null}]);

    clickFeature(null, null, null, null, tableApi, tableData);

    mockTable.verify();
  });

  it('clicks on a block group not in list', () => {
    const tableData = [tableHeadings, [1, 99, 0.46, 0.52]];
    mockTable.expects('setSelection').once().withArgs([]);

    clickFeature(null, null, null, 'mockAsset', tableApi, tableData);

    mockTable.verify();
  });

  it('click then unclick a block group', () => {
    const tableData = [tableHeadings, [0, 99, 0.46, 0.52]];
    mockTable.expects('setSelection').once().withArgs([{row: 0, column: null}]);
    mockTable.expects('setSelection').once().withArgs([]);

    clickFeature(null, null, null, 'mockAsset', tableApi, tableData);
    clickFeature(null, null, null, 'mockAsset', tableApi, tableData);

    mockTable.verify();
  });
});
