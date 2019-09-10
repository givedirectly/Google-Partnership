import {damageTag, geoidTag, scoreTag, snapTag} from './process_joined_data.js';

export {drawTable as default};

const tableHeadings = [geoidTag, scoreTag, snapTag, damageTag];

/**
 * Display a ranked table of the given features that have non-zero score.
 *
 * @param {ee.FeatureCollection} features
 * @param {Object} selectCallback Callback to be invoked for selected features.
 */
function drawTable(features, selectCallback) {
  const sortedNonZeroScores =
      features.filter(ee.Filter.gt(scoreTag, ee.Number(0)))
          .sort(scoreTag, false);
  const pairOfListAndFeaturesComputation =
      sortedNonZeroScores.iterate((feature, result) => {
        const listResult = ee.List(result);
        return ee.List([
          ee.List(listResult.get(0))
              .add(tableHeadings.map((col) => feature.get(col))),
          ee.List(listResult.get(1)).add(feature),
        ]);
      }, ee.List([ee.List([tableHeadings]), ee.List([])]));


  // Create download button.
  const downloadButton = document.createElement('button');
  downloadButton.style.visibility = 'hidden';
  downloadButton.id = 'downloadButton';
  downloadButton.innerHTML = 'Download';
  document.getElementById('tableContainer').appendChild(downloadButton);
  const downloadLink = document.createElement('a');
  downloadLink.id = 'downloadLink';
  downloadButton.appendChild(downloadLink);

  // TODO(#37): These callbacks could be executed out of order, and the table
  //  might not reflect the user's latest request.
  pairOfListAndFeaturesComputation.evaluate(
      (pairOfListAndFeatures, failure) => {
        if (typeof failure !== 'undefined') {
          // TODO(juliexxia): more robust error reporting
          // https://developers.google.com/chart/interactive/docs/reference#errordisplay
          console.error(failure);
        } else {
          // Multiple calls to this are fine:
          // https://developers.google.com/chart/interactive/docs/basic_load_libs#Callback
          google.charts.setOnLoadCallback(
              () => renderTable(pairOfListAndFeatures, selectCallback));
          // Set download button to visible once table data is loaded.
          document.getElementById('downloadButton').style.visibility = 'visible';
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
function renderTable(pairOfListAndFeatures, selectCallback) {
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
    },
  });
  google.visualization.events.addListener(table, 'select', () => {
    const selection = table.getChart().getSelection();
    selectCallback(selection.map((elt) => features[elt.row]));
  });
  table.draw();

  const downloadButton = document.getElementById('downloadButton');
  // Generate content and download on click.
  downloadButton.addEventListener('click', function() {
    // Add column headers to front of string content.
    const columnHeaders = tableHeadings.join(',');
    const content =
        columnHeaders + '\n' + google.visualization.dataTableToCsv(data);
    downloadContent(content);
  });
}

/**
 * Generates a file with the content passed and downloads it.
 *
 * @param {string} content Content to be downloaded in file.
 */
function downloadContent(content) {
  const downloadLink = document.getElementById('downloadLink');
  downloadLink.href =
      URL.createObjectURL(new Blob([content], {type: 'text/csv'}));
  downloadLink.download = 'data.csv';

  downloadLink.click();
}
