import clickFeature from './click_feature.js';
import {damageTag, geoidTag, scoreTag, snapTag} from './process_joined_data.js';

export {currentTable, drawTable, tableData};

let tableData = null;
let currentTable = null;

/**
 * Display a ranked table of the given features that have non-zero score.
 *
 * @param {ee.FeatureCollection} features
 * @param {Object} selectCallback Callback to be invoked for selected features.
 */
function drawTable(features, selectCallback, map, joinedSnapAsset) {
  const nonZeroScores = features.filter(ee.Filter.gt(scoreTag, ee.Number(0)));
  const headings = [geoidTag, scoreTag, snapTag, damageTag];
  const pairOfListAndFeaturesComputation =
      nonZeroScores.iterate((feature, result) => {
        const listResult = ee.List(result);
        return ee.List([
          ee.List(listResult.get(0))
              .add(headings.map((col) => feature.get(col))),
          ee.List(listResult.get(1)).add(feature),
        ]);
      }, ee.List([ee.List([headings]), ee.List([])]));
  // TODO(#37): These callbacks could be executed out of order, and the table
  //  might not reflect the user's latest request.
  pairOfListAndFeaturesComputation.evaluate(
      (pairOfListAndFeatures, failure) => {
        if (typeof failure !== 'undefined') {
          // TODO(juliexxia): more robust error reporting
          // https://developers.google.com/chart/interactive/docs/reference#errordisplay
          console.error(failure);
        } else {
          tableData = pairOfListAndFeatures[0];
          // Multiple calls to this are fine:
          // https://developers.google.com/chart/interactive/docs/basic_load_libs#Callback
          google.charts.setOnLoadCallback(
              () => renderTable(
                  pairOfListAndFeatures, selectCallback, map, joinedSnapAsset));
        }
      });
}

/**
 * Renders the actual table on the page.
 *
 * @param {Array} pairOfListAndFeatures An array with two elements. The first is
 * the data to display in the chart. The second is the list of features
 * corresponding to that data.
 * @param {Object} selectCallback Callback to be invoked for selected features.
 */
function renderTable(
    pairOfListAndFeatures, selectCallback, map, joinedSnapAsset) {
  const data =
      google.visualization.arrayToDataTable(pairOfListAndFeatures[0], false);
  const features = pairOfListAndFeatures[1];
  // Instantiate and draw the chart.
  const table = new google.visualization.ChartWrapper({
    'chartType': 'Table',
    'containerId': 'table',
    'dataTable': data,
    'options': {
      'page': 'enable',
      'pageSize': 25,
      'sortColumn': 1,
      'sortAscending': false,
    },
  });
  currentTable = table;
  google.visualization.events.addListener(table, 'select', () => {
    const selection = table.getChart().getSelection();
    selectCallback(selection.map((elt) => features[elt.row]));
  });
  table.draw();
  // TODO: handle ctrl+click situations
  google.maps.event.addListener(map, 'click', (event) => {
    clickFeature(event, map, joinedSnapAsset);
  });
}
