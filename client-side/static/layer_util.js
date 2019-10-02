import createError from './create_error.js';
import {mapContainerId} from './dom_constants.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';

export {
  addLayer,
  addLayerFromGeoJsonPromise,
  addNullLayer,
  redrawLayers,
  removeScoreLayer,
  scoreLayerName,
  setMap,
  toggleLayerOff,
  toggleLayerOn,
};
// @VisibleForTesting
export {layerArray, layerMap, LayerMapValue};

const scoreLayerName = 'score';

// Keep a map of asset name -> overlay, index, display status. Overlays are
// lazily generated i.e. pre-known assets that don't display by
// default will have an entry in this map, but the LayerMapValue will have a
// null overlay field until we do want to display it. Currently assume we're
// only working with one map.
const layerMap = {};

const layerArray = [];

const deckGlOverlay = new deck.GoogleMapsOverlay();

/** Values of layerMap. */
class LayerMapValue {
  /**
   * Constructor.
   *
   * @param {GeoJSON} data Data to be rendered
   * @param {number} index Z-index of layer when displayed. Higher is better.
   * @param {boolean} displayed True if layer is currently displayed
   */
  constructor(data, index, displayed) {
    this.data = data;
    this.index = index;
    this.displayed = displayed;
    this.loading = false;
  }
}

/**
 * Sets the map for deck.gl. Called only at startup.
 *
 * @param {google.maps.Map} map
 */
function setMap(map) {
  deckGlOverlay.setMap(map);
}

/**
 * Toggles on displaying an asset on the map.
 *
 * @param {string} assetName
 */
function toggleLayerOn(assetName) {
  const currentLayerMapValue = layerMap[assetName];
  currentLayerMapValue.displayed = true;
  if (currentLayerMapValue.data) {
    addLayerFromFeatures(currentLayerMapValue, assetName);
  } else {
    addLayer(
        ee.FeatureCollection(assetName), assetName, currentLayerMapValue.index);
  }
}

/**
 * Toggles off displaying an asset on the map.
 *
 * @param {string} assetName
 */
function toggleLayerOff(assetName) {
  removeLayer(assetName);
}

const coloring = (f) => showColor(f.properties['color']);

/**
 * Creates a deck.gl layer from the given value's GeoJSON data.
 *
 * @param {LayerMapValue} layerMapValue
 * @param {string} assetName
 */
function addLayerFromFeatures(layerMapValue, assetName) {
  layerArray[layerMapValue.index] = new deck.GeoJsonLayer({
    id: assetName,
    data: layerMapValue.data,
    pointRadiusScale: 500,
    getFillColor: coloring,
    visible: layerMapValue.displayed,
  });
  redrawLayers();
}

const black = [0, 0, 0, 255];

/**
 * Utility function to return the given color if defined, or black if undefined.
 *
 * @param {Array} color RGBA color specification as an array, or undefined/null
 * @return {Array} RGBA color specification as an array
 */
function showColor(color) {
  return color ? color : black;
}

/**
 * Asynchronous wrapper for addLayerFromFeatures that calls getMap() with a
 * callback to avoid blocking on the result. This also populates layerMap.
 *
 * This should only be called once per asset when its overlay is initialized
 * for the first time. After the overlay is non-null in layerMap, any displaying
 * should be able to set its visibility and redraw the layers.
 *
 * @param {ee.Element} layer
 * @param {string} assetName
 * @param {number} index
 */
function addLayer(layer, assetName, index) {
  addLoadingElement(mapContainerId);
  // Add entry to map.
  const layerMapValue = new LayerMapValue(null, index, true);
  layerMap[assetName] = layerMapValue;
  ee.FeatureCollection(layer).toList(250000).evaluate((features, failure) => {
    if (features) {
      layerMapValue.data = features;
      addLayerFromFeatures(layerMapValue, assetName);
    } else {
      // TODO: if there's an error, disable checkbox, add tests for this.
      createError('getting id for ' + assetName)(failure);
    }
    loadingElementFinished(mapContainerId);
  });
}

/**
 * Adds a visible layer to the map from a Promise that resolves to a GeoJSON
 * list of Features.
 *
 * @param {Promise<Array<GeoJson>>}featuresPromise
 * @param {string} assetName
 * @param {number} index Ordering of layer (higher is more visible)
 */
function addLayerFromGeoJsonPromise(featuresPromise, assetName, index) {
  addLoadingElement(mapContainerId);
  // Add entry to map.
  const layerMapValue = new LayerMapValue(null, index, true);
  layerMap[assetName] = layerMapValue;
  featuresPromise
      .then((features) => {
        layerMapValue.data = features;
        addLayerFromFeatures(layerMapValue, assetName);
        loadingElementFinished(mapContainerId);
      })
      .catch(createError('Error rendering ' + assetName));
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

const hasContent = (val) => val;

/**
 * Sets the "layers" attribute of deckGlOverlay to the non-null elements of
 * layerArray, which has the effect of redrawing it on the map.
 */
function redrawLayers() {
  deckGlOverlay.setProps({layers: layerArray.filter(hasContent)});
}

/**
 * Removes an overlay from the map by setting its index in overlayMapTypes to
 * null. Records it is no longer being displayed in layerMap.
 *
 * @param {string} assetName
 */
function removeLayer(assetName) {
  const layerMapValue = layerMap[assetName];
  layerMapValue.displayed = false;
  addLayerFromFeatures(layerMapValue, assetName);
}

/** Removes the score layer overlay before a parameter update. */
function removeScoreLayer() {
  layerArray[layerMap[scoreLayerName].index] = null;
  redrawLayers();
}
