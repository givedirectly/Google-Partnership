import {currentFeatures, highlightFeatures} from './highlight_features.js';
import {blockGroupTag, geoidTag, scoreTag} from './property_names.js';

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
 */
function clickFeature(lng, lat, map, featuresAsset, tableSelector) {
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
      tableSelector([]);
    } else {
      highlightFeatures([feature], map);
      const rowData = tableSelector([geoid]);
      const infoWindow = new google.maps.InfoWindow();
      infoWindow.setContent(createHtmlForPopup(feature, rowData));
      const borderPoint = feature.geometry.coordinates[0][0];
      infoWindow.setPosition(
          new google.maps.LatLng({lat: borderPoint[1], lng: borderPoint[0]}));
      infoWindow.open(map);
      currentFeatures.get(geoid).setPopup(infoWindow);
    }
  });
}

const HIDDEN_PROPERTIES = Object.freeze(new Set([  geoidTag,
  blockGroupTag,
  scoreTag,
]));

/**
 * Puts the information for a blockgroup into a div.
 * @param {Feature} feature post-evaluate JSON feature
 * @param {?Array<string>} rowData Data from selected row in table for this
 *     feature, if found
 * @return {HTMLDivElement} Div with information
 */
function createHtmlForPopup(feature, rowData) {
  const div = document.createElement('div');
  const heading = document.createElement('h4');
  heading.innerText = feature.properties[blockGroupTag];
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
  for (let [heading, value] of Object.entries(feature.properties)) {
    if (HIDDEN_PROPERTIES.has(heading)) {
      continue;
    }
    const property = document.createElement('li');
    if (heading.endsWith(' PERCENTAGE')) {
      value = parseFloat(value).toFixed(3);
    }
    property.innerText = heading + ': ' + value;
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
