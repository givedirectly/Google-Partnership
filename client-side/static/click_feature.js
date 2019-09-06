import {highlightFeatures} from './highlight_features.js';
import {geoidTag} from './process_joined_data.js';

export {clickFeature};

/**
 * Fiven a click event, finds the feature and highlights it in the list and on
 * the map.
 *
 * @param {number} lng longitude of the click
 * @param {number} lat latitude of the click
 * @param {google.maps.Map} map
 * @param {string} joinedSnapAsset asset path of block groups
 * @param {google.visualization.TableChart} table the actual table object
 * @param {array} tableData 2-d array with inner arrays of form {@code headings}
 *        in draw_table.js where the first inner array is {@code headings}.
 */
function clickFeature(lng, lat, map, joinedSnapAsset, table, tableData) {
  const point = ee.Geometry.Point(lng, lat);
  const blockGroups = ee.FeatureCollection(joinedSnapAsset).filterBounds(point);
  blockGroups.size().evaluate((size, failure) => {
    if (failure) {
      console.error(failure);
      return;
    }
    if (size === 0) {
      // clicked on a block group with no damage.
      return;
    }
    if (size !== 1) {
      console.error('unexpected state: click returned > 1 block group');
      return;
    }
    const selected = blockGroups.first();
    selected.evaluate((feature, failure) => {
      if (failure) {
        console.error(failure);
        return;
      }
      highlightFeatures([feature], map);
      const geoid = feature.properties[geoidTag];
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
    });
  });
}
