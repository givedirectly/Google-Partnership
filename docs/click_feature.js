import {showError} from './error.js';
import {currentFeatures, highlightFeatures} from './highlight_features.js';
import {geoidTag, scoreTag} from './property_names.js';

export {clickFeature, selectHighlightedFeatures};

/**
 * Given a click event, finds the feature and highlights it in the list and on
 * the map.
 *
 * @param {number} lng longitude of the click
 * @param {number} lat latitude of the click
 * @param {google.maps.Map} map
 * @param {string|ee.FeatureCollection} featuresAsset asset (path) of features
 *     which could be clicked
 * @param {Function} tableSelector See drawTable
 * @param {ScoreParameters} scoreParameters Needed for `districtDescriptionKey`
 * @param {Array<EeColumn>} columns Properties to show on click
 */
function clickFeature(
    lng, lat, map, featuresAsset, tableSelector, scoreParameters, columns) {
  const point = ee.Geometry.Point(lng, lat);
  const blockGroups = ee.FeatureCollection(featuresAsset).filterBounds(point);
  const selected = blockGroups.first();
  selected.evaluate((feature, failure) => {
    if (failure) {
      showError(failure, 'Error finding clicked-on area: ' + failure);
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
      tableSelector([]);
    } else {
      highlightFeatures([feature], map);
      const rowData = tableSelector([geoid]);
      const infoWindow = new google.maps.InfoWindow();
      infoWindow.setContent(
          createHtmlForPopup(feature, rowData, scoreParameters, columns));
      const borderPoint = feature.geometry.coordinates[0][0];
      infoWindow.setPosition(
          new google.maps.LatLng({lat: borderPoint[1], lng: borderPoint[0]}));
      infoWindow.open(map);
      currentFeatures.get(geoid).setPopup(infoWindow);
    }
  });
}

const HIDDEN_PROPERTIES = Object.freeze(new Set([
  geoidTag,
  scoreTag,
]));

/**
 * Puts the information for a blockgroup into a div.
 * @param {Feature} feature post-evaluate JSON feature
 * @param {?Array<string>} rowData Data from selected row in table for this
 *     feature, if found
 * @param {ScoreParameters} scoreParameters
 * @param {Array<EeColumn>} columns
 * @return {HTMLDivElement} Div with information
 */
function createHtmlForPopup(feature, rowData, scoreParameters, columns) {
  const div = document.createElement('div');
  const heading = document.createElement('h4');
  const {districtDescriptionKey} = scoreParameters;
  heading.innerText = feature.properties[districtDescriptionKey];
  const properties = document.createElement('ul');
  properties.style.listStyleType = 'none';
  // We know the score was 0 if the block group isn't in the list
  if (rowData === null) {
    const property = document.createElement('li');
    property.innerText = 'SCORE: 0';
    properties.appendChild(property);
  } else {
    const property = document.createElement('li');
    property.innerText = 'SCORE: ' + rowData[2];
    properties.appendChild(property);
  }
  for (const column of columns) {
    if (HIDDEN_PROPERTIES.has(column) || column === districtDescriptionKey) {
      continue;
    }
    let value = feature.properties[column];
    const property = document.createElement('li');
    if (value && column.endsWith(' PERCENTAGE')) {
      value = parseFloat(value).toFixed(3);
    }
    property.innerHTML = column + ': ' +
        (value !== null && value !== undefined ?
             value :
             '<span class="data-unavailable-span">(data unavailable)</span>');
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
 * @param {Function} tableSelector Selects table rows with specified geoids
 */
function selectHighlightedFeatures(tableSelector) {
  tableSelector(currentFeatures.keys());
}
