import createError from './create_error.js';
import {scoreLayerName} from './run.js';

export {
  addLayer,
  addNullLayer,
  removeScoreLayer,
  toggleLayerOff,
  toggleLayerOn,
};
// @VisibleForTesting
export {layerMap, LayerMapValue};

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
 * Toggles on displaying an asset on the map.
 *
 * @param {google.map.Maps} map
 * @param {string} assetName
 */
function toggleLayerOn(map, assetName) {
  const currentLayerMapValue = layerMap[assetName];
  if (currentLayerMapValue.overlay === null) {
    addLayer(
        map, ee.FeatureCollection(assetName), assetName,
        currentLayerMapValue.index);
  } else {
    map.overlayMapTypes.setAt(
        currentLayerMapValue.index, currentLayerMapValue.overlay);
    currentLayerMapValue.displayed = true;
  }
}

/**
 * Toggles off displaying an asset on the map.
 *
 * @param {google.map.Maps} map
 * @param {string} assetName
 */
function toggleLayerOff(map, assetName) {
  removeLayer(map, assetName);
}

/**
 * Create an EarthEngine layer (from EEObject.getMap()), potentially add to the
 * given Google Map and returns the overlay, in case the caller wants to add
 * callbacks or similar to that overlay.
 *
 * @param {google.maps.Map} map
 * @param {Object} layerId
 * @param {number} index
 * @param {boolean} displayed
 * @param {function(): *} callback Function invoked when the layer is rendered
 * @return {ee.MapLayerOverlay}
 */
function addLayerFromId(map, layerId, index, displayed, callback) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map', layerId.mapid, layerId.token,
      {});
  // Detect when the layer finishes rendering and fire a callback accordingly.
  if (callback) {
    overlay.addTileCallback((tileEvent) => {
      if (tileEvent.count == 0) {
        callback();
      }
    });
  }
  // Check in case the status has changed while the callback was running.
  if (displayed) {
    map.overlayMapTypes.setAt(index, overlay);
  }
  return overlay;
}

/**
 * Asynchronous wrapper for addLayerFromId that calls getMap() with a callback
 * to avoid blocking on the result. This also populates layerMap.
 *
 * This should only be called once per asset when its overlay is initialized
 * for the first time. After the overlay is non-null in layerMap, any displaying
 * should be able to call {@code map.overlayMapTypes.setAt(...)}.
 *
 * @param {google.maps.Map} map
 * @param {ee.Element} layer
 * @param {string} assetName
 * @param {number} index
 * @param {function(): *} callback Function invoked when the layer is rendered
 */
function addLayer(map, layer, assetName, index, callback) {
  // Add a null-overlay entry to layerMap while waiting for the callback to
  // finish.
  layerMap[assetName] = new LayerMapValue(null, index, true);
  layer.getMap({
    callback: (layerId, failure) => {
      if (layerId) {
        layerMap[assetName].overlay =
            addLayerFromId(
                map, layerId, index, layerMap[assetName].displayed, callback);
      } else {
        // TODO: if there's an error, disable checkbox, add tests for this.
        layerMap[assetName].displayed = false;
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
  layerMap[assetName].displayed = false;
}

/**
 * Removes the score layer overlay.
 * @param {google.maps.Map} map
 */
function removeScoreLayer(map) {
  removeLayer(map, scoreLayerName);
}
