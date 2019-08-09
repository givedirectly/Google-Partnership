import {geoidTag, priorityTag, snapTag, zero} from './script.js';

export {drawTable as default};

/*
 * Draw a ranked table of the given features that have a SNAP ratio over the
 * given threshold.
 */
function drawTable(features) {
  const sortedNonZeroPriority =
      features.filter(ee.Filter.gt(priorityTag, zero)).sort(priorityTag, false);
  const headings = [geoidTag, priorityTag, snapTag];
  const asListWithHeadings =
      ee.List(sortedNonZeroPriority.iterate(function(feature, list) {
        return ee.List(list).add(headings.map(col => feature.get(col)));
      }, [headings]));
  // TODO(#37): These callbacks could be executed out of order, and the table
  //  might not reflect the user's latest request.
  asListWithHeadings.evaluate(function(evaluatedTable, failure) {
    if (typeof failure !== 'undefined') {
      // TODO(juliexxia): more robust error reporting
      // https://developers.google.com/chart/interactive/docs/reference#errordisplay
      console.log(failure);
    } else {
      // Multiple calls to this are fine:
      // https://developers.google.com/chart/interactive/docs/basic_load_libs#Callback
      google.charts.setOnLoadCallback(() => renderTable(evaluatedTable));
    }
  });
}

function renderTable(evaluatedTable) {
  const data = google.visualization.arrayToDataTable(evaluatedTable, false);
  // Instantiate and draw the chart.

  const table = new google.visualization.ChartWrapper({
    'chartType': 'Table',
    'containerId': 'table',
    'dataTable': data,
    'options': {
      'page': 'enable',
      'pageSize': 25,
    }
  });
  table.draw();
}
