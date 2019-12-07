import {createError} from './error.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, scoreTag, snapPercentageTag, sviTag, totalPopTag} from './property_names.js';

export {drawTable, tableHeadings};

const tableHeadings = [
  geoidTag,
  blockGroupTag,
  scoreTag,
  snapPercentageTag,
  damageTag,
  buildingCountTag,
  totalPopTag,
  sviTag,
  incomeTag,
];

/**
 * Displays a ranked table of the given features that have non-zero score.
 *
 * @param {Promise} scoredFeatures
 * @param {Function} selectTableCallback Callback to be invoked when a table row
 *     is selected by the user
 * @return {Promise<Function>} Promise for a function that takes an iterable of
 *     strings and selects rows in the table whose geoids are those strings. The
 *     function returns the row selected if there was exactly one, or null
 *     otherwise. Complete when table has finished drawing
 */
function drawTable(scoredFeatures, selectTableCallback) {
  // Create download button.
  const downloadButton = document.createElement('button');
  downloadButton.style.visibility = 'hidden';
  downloadButton.id = 'downloadButton';
  downloadButton.className = 'form-button';
  downloadButton.innerHTML = 'Download';
  document.getElementById('tableContainer').appendChild(downloadButton);
  const downloadLink = document.createElement('a');
  downloadLink.id = 'downloadLink';
  downloadButton.appendChild(downloadLink);

  // TODO(#37): These callbacks could be executed out of order, and the table
  //  might not reflect the user's latest request.
  return scoredFeatures
      .then((allFeatures) => {
        const features =
            allFeatures.filter((feature) => feature.properties[scoreTag]);
        // Clone headings.
        const list = [tableHeadings];
        for (const feature of features) {
          list.push(tableHeadings.map((col) => feature.properties[col]));
        }
        // TODO(juliexxia): more robust error reporting
        // https://developers.google.com/chart/interactive/docs/reference#errordisplay
        return new Promise((resolve) => {
          // Multiple calls to this are fine:
          // https://developers.google.com/chart/interactive/docs/basic_load_libs#Callback
          google.charts.setOnLoadCallback(
              () => renderTable(list, features, selectTableCallback, resolve));
        });
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
 * @param {Function} selectTableCallback See {@link drawTable}
 * @param {Function} selectorReceiver receiver for the function inside the
 *     Promise returned by {@link drawTable}
 */
function renderTable(list, features, selectTableCallback, selectorReceiver) {
  const data = google.visualization.arrayToDataTable(list, false);
  const dataView = new google.visualization.DataView(data);
  // don't display geoid
  dataView.hideColumns([0]);
  const table =
      new google.visualization.Table(document.getElementById('table'));
  table.draw(
      dataView,
      {page: 'enable', pageSize: 25, sortColumn: 1, sortAscending: false});
  const tableSelector = new TableSelector(table, list);
  selectorReceiver((geoids) => tableSelector.selectRowsFor(geoids));

  google.visualization.events.addListener(
      table, 'select',
      () => selectTableCallback(
          table.getSelection().map((elt) => features[elt.row])));

  const downloadButton = document.getElementById('downloadButton');
  // Generate content and download on click.
  downloadButton.addEventListener('click', function() {
    // Add column headers to front of string content.
    const columnHeaders = tableHeadings.join(',');
    const content =
        columnHeaders + '\n' + google.visualization.dataTableToCsv(data);
    downloadContent(content);
  });
  // Set download button to visible once table data is loaded.
  document.getElementById('downloadButton').style.visibility = 'visible';
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

/**
 * Utility class to do the work of finding matching rows in the table and
 * selecting them.
 */
class TableSelector {
  /**
   * @constructor
   * @param {google.visualization.Table} table
   * @param {Array<Array<string>>} tableData
   */
  constructor(table, tableData) {
    this.table = table;
    this.tableData = tableData;
  }

  /**
   * Finds the rows with the given geoids and selects them in the table.
   * @param {Iterable<string>} geoids Ids of rows (0th element)
   * @return {?Array<string>} selected row, if exactly one was found, or null
   */
  selectRowsFor(geoids) {
    const selection = [];
    for (const geoid of geoids) {
      const row = this.findRowNumber(geoid);
      // underlying data does not include headings row.
      selection.push({row: row - 1, column: null});
    }
    // TODO: flip to page of the list the selected area is on if not current
    //  page.
    this.table.setSelection(selection);
    if (selection.length === 1) {
      return this.tableData[selection[0].row + 1];
    }
    return null;
  }

  /**
   * Given a geoid string, searches for it in this.tableData's 0th columns.
   *
   * @param {string} geoid
   * @return {number|null} the 1-indexed row, or null if not found
   */
  findRowNumber(geoid) {
    for (let i = 1; i < this.tableData.length; i++) {
      if (this.tableData[i][0] === geoid) {
        return i;
      }
    }
    return null;
  }
}
