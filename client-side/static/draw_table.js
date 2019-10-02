import createError from './create_error.js';
import {blockGroupTag, damageTag, geoidTag, scoreTag, snapPercentageTag} from './property_names.js';

export {drawTable, tableHeadings};

const tableHeadings =
    [geoidTag, blockGroupTag, scoreTag, snapPercentageTag, damageTag];

/**
 * Display a ranked table of the given features that have non-zero score.
 *
 * @param {Promise} scoredFeatures
 * @param {Object} selectTableCallback Callback to be invoked for selected table
 *     row
 * @param {Object} chartAndFeaturesReceiver receiver for chart and contents
 *     when they are ready.
 */
function drawTable(
    scoredFeatures, selectTableCallback, chartAndFeaturesReceiver) {
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
  scoredFeatures
      .then((allFeatures) => {
        const features =
            allFeatures.filter((feature) => feature.properties[scoreTag]);
        // Clone headings.
        const list = [tableHeadings];
        for (const feature of features) {
          list.push(tableHeadings.map((col) => feature.properties[col]));
        }
        // Multiple calls to this are fine:
        // https://developers.google.com/chart/interactive/docs/basic_load_libs#Callback
        google.charts.setOnLoadCallback(
            () => renderTable(
                list, features, selectTableCallback, chartAndFeaturesReceiver));
        // Set download button to visible once table data is loaded.
        document.getElementById('downloadButton').style.visibility = 'visible';
        // TODO(juliexxia): more robust error reporting
        // https://developers.google.com/chart/interactive/docs/reference#errordisplay
      })
      .catch(createError('Failure evaluating scored features'));
}

/**
 * Renders the actual table on the page and adds a callback to the map to
 * highlight rows in the table if the corresponding feature is clicked on the
 * map.
 *
 * @param {Array} list The data to display in the chart, with headings
 * @param {Array} features The list of features corresponding to that data
 * @param {Object} selectTableCallback Callback to be invoked for selected table
 *     row
 * @param {Object} chartAndFeaturesReceiver receiver for chart and contents
 *     when they are ready.
 */
function renderTable(
    list, features, selectTableCallback, chartAndFeaturesReceiver) {
  const data = google.visualization.arrayToDataTable(list, false);
  const dataView = new google.visualization.DataView(data);
  // don't display geoid
  dataView.hideColumns([0]);
  // Instantiate and draw the chart.
  const table = new google.visualization.ChartWrapper({
    'chartType': 'Table',
    'containerId': 'table',
    'dataTable': dataView,
    'options': {
      'page': 'enable',
      'pageSize': 25,
      'sortColumn': 1,
      'sortAscending': false,
    },
  });
  google.visualization.events.addListener(table, 'select', () => {
    const selection = table.getChart().getSelection();
    selectTableCallback(selection.map((elt) => features[elt.row]));
  });
  table.draw();

  chartAndFeaturesReceiver(table.getChart(), list);

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
