import {currentTable, tableData} from './draw_table.js';
import highlightFeatures from './highlight_features.js';
import {geoidTag} from './process_joined_data.js';

export {clickFeature as default};

/**
 * Fiven a click event, finds the feature and highlights it in the list and on
 * the map.
 *
 * @param {Event} event click event
 * @param {google.maps.Map} map
 * @param {string} joinedSnapAsset
 */
function clickFeature(event, map, joinedSnapAsset) {
  const point = ee.Geometry.Point(event.latLng.lng(), event.latLng.lat());
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
          // underlaying data does not include header row.
          rowNumber = i - 1;
          break;
        }
      }
      // TODO: flip to page of the list the highlighted area is on if not
      // current page.
      currentTable.getChart().setSelection([{row: rowNumber, column: null}]);
    });
  });
}
