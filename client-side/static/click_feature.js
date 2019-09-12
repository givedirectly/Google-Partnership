import {currentFeatures, highlightFeatures} from './highlight_features.js';
import {geoidTag} from './property_names.js';

export {clickFeature};

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
  if (selected === null) {
    return;
  }
  selected.evaluate((feature, failure) => {
    if (failure) {
      console.error(failure);
      return;
    }
    const geoid = feature.properties[geoidTag];
    const currentKeys = Array.from(currentFeatures.keys());
    // Check for length 1 because if we've selected a group in the list then
    // select just the one on the map, we should still highlight the one.
    if (currentKeys.length === 1 && currentKeys.includes(geoid)) {
      highlightFeatures([], map);
      table.setSelection([]);
    } else {
      highlightFeatures([feature], map);
      let rowNumber = null;
      for (let i = 1; i < tableData.length; i++) {
        if (tableData[i][0] === geoid) {
          // underlaying data does not include headings row.
          rowNumber = i - 1;
          break;
        }
      }
      // TODO: flip to page of the list the highlighted area is on if not
      // current page.
      if (rowNumber !== null) {
        table.setSelection([{row: rowNumber, column: null}]);
      }
    }
  });
}
