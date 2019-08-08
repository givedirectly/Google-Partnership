import {geoidTag, priorityTag, snapTag, zero} from './script.js';

export {drawTable as default};

/*
 * Draw a ranked table of the given features that have a SNAP ratio over the
 * given threshold.
 */ 
// TODO(juliexxia): see if we can do earth engine calls needed in this method without waiting
// on google.charts to load + consider if this happens synchronously after the first time.
function drawTable(features) {
  const sortedNonZeroPriority = features.filter(ee.Filter.gt(priorityTag, zero))
      .sort(priorityTag, false);
  const headings = [geoidTag, priorityTag, snapTag];
  const asListWithHeadings =
      ee.List(sortedNonZeroPriority.iterate(function(feature, list) {
        return ee.List(list).add(headings.map(col => feature.get(col)));
      }, [headings]));
  asListWithHeadings.evaluate(function(success, failure) {
    if (typeof failure !== 'undefined') {
      // TODO(juliexxia): more robust error reporting
      // https://developers.google.com/chart/interactive/docs/reference#errordisplay
      console.log(failure);
    } else {
      const data = google.visualization.arrayToDataTable(success, false);
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
  });
}
