import {clickFeature} from '../../../client-side/static/click_feature.js';
import {tableHeadings} from '../../../client-side/static/draw_table.js';
import * as HighlightFeatures from '../../../client-side/static/highlight_features.js';
// import {CurrentFeatureValue} from '../../../client-side/static/highlight_features';
// import {CurrentFeaturesValue} from '../../../client-side/static/highlight_features.js';

let mockTable;
let tableApi;

describe('Unit test for click_feature.js', () => {
  beforeEach(() => {

    HighlightFeatures.CurrentFeaturesValue = (data) => new CurrentFeaturesValue();
    class CurrentFeaturesValue {
      constructor(dataFeatures) {
        this.dataFeatures = dataFeatures;
      }
      setPopup(popup) {
        this.popup = popup;
      }
    }

    cy.stub(HighlightFeatures, 'highlightFeatures', (features, map) => {
      if (features.length === 0) {
        HighlightFeatures.currentFeatures.clear();
      } else {
        const blah = new CurrentFeaturesValue();
        HighlightFeatures.currentFeatures.set(0, new HighlightFeatures.CurrentFeaturesValue());
      }
    });

    tableApi = {
      setSelection: (selection) => {},
    };
    mockTable = Cypress.sinon.mock(tableApi);
    HighlightFeatures.currentFeatures.clear();
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

    clickFeature(null, null, null, null, tableApi, tableData);

    mockTable.verify();
  });

  it('click then unclick a block group', () => {
    const tableData = [tableHeadings, [0, 99, 0.46, 0.52]];
    mockTable.expects('setSelection').once().withArgs([{row: 0, column: null}]);
    mockTable.expects('setSelection').once().withArgs([]);

    clickFeature(null, null, null, null, tableApi, tableData);
    clickFeature(null, null, null, null, tableApi, tableData);

    mockTable.verify();
  });
});
