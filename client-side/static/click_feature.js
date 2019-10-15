import {currentFeatures, highlightFeatures} from './highlight_features.js';
import {blockGroupTag, geoidTag} from './property_names.js';
export {clickFeature, selectHighlightedFeatures};

/**
 * Given a click event, finds the feature and highlights it in the list and on
 * the map.
 *
 * @param {number} lng longitude of the click
 * @param {number} lat latitude of the click
 * @param {google.maps.Map} map
 * @param {string} featuresAsset asset path of features which could be clicked.
 * @param {google.visualization.TableChart} table the actual table object
 * @param {array} tableData 2-d array with inner arrays of form {@code headings}
 *        in draw_table.js where the first inner array is {@code headings}.
 */
function clickFeature(lng, lat, map, featuresAsset, table, tableData) {
  const point = ee.Geometry.Point(lng, lat);
  const blockGroups = ee.FeatureCollection(featuresAsset).filterBounds(point);
  const selected = blockGroups.first();
  selected.evaluate((feature, failure) => {
    if (failure) {
      console.error(failure);
      return;
    }
    if (feature === null) {
      return;
    }
    const geoid = feature.properties[geoidTag];
    const currentKeys = Array.from(currentFeatures.keys());
    // Allow unselecting via the map.
    if (currentKeys.length === 1 && currentKeys.includes(geoid)) {
      highlightFeatures([], map);
      table.setSelection([]);
    } else {
      highlightFeatures([feature], map);
      const rowNumber = findRowNumber(geoid, tableData);
      // TODO: flip to page of the list the highlighted area is on if not
      // current page.
      if (rowNumber === null) {
        table.setSelection([]);
      } else {
        // underlaying data does not include headings row.
        table.setSelection([{row: rowNumber - 1, column: null}]);
      }
      const infoWindow = new google.maps.InfoWindow();
      infoWindow.setContent(createHtmlForPopup(feature, tableData, rowNumber));
      const borderPoint = feature.geometry.coordinates[0][0];
      infoWindow.setPosition(
          new google.maps.LatLng({lat: borderPoint[1], lng: borderPoint[0]}));
      infoWindow.open(map);
      currentFeatures.get(geoid).setPopup(infoWindow);
    }
  });
}

/**
 * Puts the information for a blockgroup into a div.
 * @param {Feature} feature post-evaluate JSON feature
 * @param {array} tableData 2-d array with inner arrays of form {@code headings}
 *        in draw_table.js where the first inner array is {@code headings}.
 * @param {?integer} rowNumber the row in the table with relevent info
 * @return {HTMLDivElement}
 */
function createHtmlForPopup(feature, tableData, rowNumber) {
  const div = document.createElement('div');
  const heading = document.createElement('h4');
  heading.innerText = feature.properties[blockGroupTag];
  const properties = document.createElement('ul');
  properties.style.listStyleType = 'none';
  // We know the score was 0 if the block group isn't in the list
  if (rowNumber === null) {
    const property = document.createElement('li');
    property.innerText = 'SCORE: 0';
    properties.appendChild(property);
  } else {
    const property = document.createElement('li');
    property.innerText = 'SCORE: ' + tableData[rowNumber][2];
    properties.appendChild(property);
  }
  const headings = tableData[0];
  for (let col = 3; col < headings.length; col++) {
    const property = document.createElement('li');
    const value = headings[col].endsWith(' PERCENTAGE') ?
      parseFloat(feature.properties[headings[col]]).toFixed(3) :
      feature.properties[headings[col]];
    property.innerText = headings[col] + ': ' + value;
    properties.appendChild(property);
  }
  div.appendChild(heading);
  div.appendChild(properties);
  return div;
}

/**
 * Given the new table and data, reselect all the current features. This is
 * meant to be called after an 'update';
 *
 * @param {google.visualization.TableChart} table the actual table object
 * @param {array} tableData 2-d array with inner arrays of form {@code headings}
 *        in draw_table.js where the first inner array is {@code headings}.
 */
function selectHighlightedFeatures(table, tableData) {
  const selection = [];
  for (const geoid of currentFeatures.keys()) {
    const row = findRowNumber(geoid, tableData);
    selection.push({row: row, column: null});
  }
  table.setSelection(selection);
}

/**
 * Given a geoid, find it in the tableData
 *
 * @param {string} geoid
 * @param {array} tableData 2-d array with inner arrays of form {@code headings}
 *        in draw_table.js where the first inner array is {@code headings}.
 * @return {number|null}
 */
function findRowNumber(geoid, tableData) {
  for (let i = 1; i < tableData.length; i++) {
    if (tableData[i][0] === geoid) {
      return i;
    }
  }
  return null;
}
