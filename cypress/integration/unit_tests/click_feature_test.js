import {clickFeature} from '../../../client-side/static/click_feature.js';
import {tableHeadings} from '../../../client-side/static/draw_table.js';
import * as HighlightFeatures from '../../../client-side/static/highlight_features.js';

let mockTable;
let tableApi;

describe('Unit test for click_feature.js', () => {
  beforeEach(() => {
    cy.stub(HighlightFeatures, 'highlightFeatures', (features, map) => {
      if (features.length === 0) {
        HighlightFeatures.currentFeatures.clear();
      } else {
        HighlightFeatures.currentFeatures.set(0, {});
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
    mockTable.expects('setSelection').never();

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
