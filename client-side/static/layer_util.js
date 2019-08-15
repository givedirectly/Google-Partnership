import {layerMap, LayerMapValue} from './run.js';

export {addLayer, removeLayer};
/**
 * Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
 * and returns the "overlay" that was added, in case the caller wants to add
 * callbacks or similar to that overlay.
 *
 * @param {ee.Element} map
 * @param {Object} layerId
 * @param {number} index
 * @return {ee.MapLayerOverlay}
 */
function addLayerFromId(map, layerId, index) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map', layerId.mapid, layerId.token,
      {});
  map.overlayMapTypes.setAt(index, overlay);
  return overlay;
}

/**
 * Asynchronous wrapper for addLayerFromId that calls getMap() with a callback
 * to avoid blocking on the result. This also populates layerMap.
 *
 * @param {google.maps.Map} map
 * @param {ee.Element} layer
 * @param {string} assetName
 * @param {number} index
 */
function addLayer(map, layer, assetName, index) {
  layer.getMap({
    callback: (layerId, failure) => {
      if (layerId) {
        const overlay = addLayerFromId(map, layerId, index);
        layerMap[assetName] = new LayerMapValue(overlay, index, true);
      } else {
        // TODO: if there's an error, disable checkbox.
        createError('getting id')(failure);
      }
    },
  });
}

/**
 * Removes an overlay from the map by setting its index in overlayMapTypes to
 * null. Records it is no longer being displayed in layerMap.
 *
 * @param {google.maps.Map} map
 * @param {string} assetName
 */
function removeLayer(map, assetName) {
  map.overlayMapTypes.setAt(layerMap[assetName].index, null);
  layerMap[assetName].displayed = false;
}