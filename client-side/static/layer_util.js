import createError from './create_error.js';
import {priorityLayerName} from './run.js';

export {addLayer, addNullLayer, removeLayer, removePriorityLayer};

// Keep a map of asset name -> overlay, index, display status. Overlays are
// lazily generated i.e. pre-known assets that don't display by
// default will have an entry in this map, but the LayerMapValue will have a
// null overlay field until we do want to display it. Currently assume we're
// only working with one map.
const layerMap = {};

/** Values of layerMap. */
class LayerMapValue {
  /**
   * @param {google.maps.MapType} overlay - the actual layer (null if not
   *     created yet)
   * @param {number} index - position in list of assets (does not change)
   * @param {boolean} displayed - true if layer is currently displayed
   */
  constructor(overlay, index, displayed) {
    this.overlay = overlay;
    /** @const */
    this.index = index;
    this.displayed = displayed;
  }
}


/**
 * Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
 * and returns the "overlay" that was added, in case the caller wants to add
 * callbacks or similar to that overlay.
 *
 * @param {google.maps.Map} map
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
 * Adds an entry to layerMap when we haven't actually generated the overlay
 * yet. Useful for assets that we don't want to display by default.
 *
 * @param {string} assetName
 * @param {number} index
 */
function addNullLayer(assetName, index) {
  layerMap[assetName] = new LayerMapValue(null, index, false);
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
  console.log(layerMap[assetName]);
  layerMap[assetName].displayed = false;
}

/**
 * Removes the priority layer overlay.
 * @param {google.maps.Map} map
 */
function removePriorityLayer(map) {
  removeLayer(map, priorityLayerName);
}
