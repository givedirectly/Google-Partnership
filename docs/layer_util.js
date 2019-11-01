import createError from './create_error.js';
import {mapContainerId} from './dom_constants.js';
import {assets, EarthEngineAsset, firebaseAssets} from './earth_engine_asset.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {convertEeObjectToPromise} from './map_util.js';

export {
  addLayer,
  addLayerFromGeoJsonPromise,
  addNullLayer,
  redrawLayers,
  removeScoreLayer,
  scoreLayerName,
  setMapToDrawLayersOn,
  toggleLayerOff,
  toggleLayerOn,
};
// @VisibleForTesting
export {layerArray, layerMap, LayerMapValue};

const scoreLayerName = 'score';

/**
 * Keep a map of asset name -> data, index, display status. Data is lazily
 * generated i.e. pre-known assets that don't display by default will have an
 * entry in this map, but the LayerMapValue will have a null data field until we
 * fetch the data when the user wants to display it. Currently assume we're only
 * working with one map.
 */
const layerMap = new Map();

/**
 * deck.gl layers, in the order they should be rendered. Passed to deckGlOverlay
 * in redrawLayers() (after filtering out absent elements).
 *
 * Contains one GeoJsonLayer per LayerMapValue with non-null data attribute
 * (from layerMap), ordered by LayerMapValue.index.
 *
 * @type {Array<deck.GeoJsonLayer>}
 */
const layerArray = [];

/**
 * Container for all deck.gl layers. Initialized lazily so tests can load file
 * without deck being defined yet.
 */
let deckGlOverlay;

/** Values of layerMap. */
class LayerMapValue {
  /**
   * Constructor.
   *
   * @param {GeoJSON} data Data to be rendered, null if not yet available.
   * @param {number} index Z-index of layer when displayed. Does not change.
   * @param {boolean} displayed True if layer is currently displayed
   */
  constructor(data, index, displayed) {
    this.data = data;
    /** @const */
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
function setMapToDrawLayersOn(map) {
  deckGlOverlay = new deck.GoogleMapsOverlay();
  deckGlOverlay.setMap(map);
}

/**
 * Toggles on displaying an asset on the map.
 *
 * @param {string} assetName
 * @param {google.maps.Map} map main map
 */
function toggleLayerOn(assetName, map) {
  const currentLayerMapValue = layerMap.get(assetName);
  currentLayerMapValue.displayed = true;
  if (currentLayerMapValue.data) {
    addLayerFromFeatures(currentLayerMapValue, assetName);
  } else {
    addLayer(assetName, currentLayerMapValue.index, map);
  }
}

/**
 * Toggles off displaying an asset on the map.
 *
 * @param {string} assetName
 * @param {google.maps.Map} map main map
 */
function toggleLayerOff(assetName, map) {
  removeLayer(assetName, map);
}

/**
 * Function object to extract a color from a JSON Feature.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} RGBA array
 */
function getColorOfFeature(feature) {
  return showColor(feature.properties['color']);
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
 */
function addImageLayer(map, layer, assetName, index) {
  const imgStyles = assets[assetName].getVisParams();
  if (assets[assetName].getStylingFunction()) {
    layer = assets[assetName].getStylingFunction()(layer);
  }
  // Add a null-overlay entry to layerMap while waiting for the callback to
  // finish.
  layerMap[assetName] = new LayerMapValue(null, index, true);
  layer.getMap({
    visParams: imgStyles,
    callback: (layerId, failure) => {
      if (layerId) {
        layerMap[assetName].overlay = addLayerFromId(
            map, assetName, layerId, index, layerMap[assetName].displayed);
      } else {
        // TODO: if there's an error, disable checkbox, add tests for this.
        layerMap[assetName].displayed = false;
        createError('getting id')(failure);
      }
    },
  });
}

/**
 * Create an EarthEngine layer (from EEObject.getMap()), potentially add to the
 * given Google Map and returns the overlay, in case the caller wants to add
 * callbacks or similar to that overlay.
 *
 * @param {google.maps.Map} map
 * @param {string} assetName
 * @param {Object} layerId
 * @param {number} index
 * @param {boolean} displayed
 * @return {ee.MapLayerOverlay}
 */
function addLayerFromId(map, assetName, layerId, index, displayed) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map', layerId.mapid, layerId.token,
      {});
  // Update loading state according to layers.
  overlay.addTileCallback((tileEvent) => {
    if (tileEvent.count == 0) {
      loadingElementFinished(mapContainerId);
      layerMap[assetName].loading = false;
    } else if (!layerMap[assetName].loading) {
      layerMap[assetName].loading = true;
      addLoadingElement(mapContainerId);
    }
  });
  // Check in case the status has changed while the callback was running.
  if (displayed) {
    map.overlayMapTypes.setAt(index, overlay);
  }
  return overlay;
}

/**
 * Creates a deck.gl layer from the given value's GeoJSON data. deck.gl is very
 * proud of its "reactive" nature. What that means here is that when layerArray
 * is given to deckGlOverlay inside redrawLayers(), deck.gl will examine each of
 * the GeoJsonLayers here and compare it to the layer *with the same id* that it
 * already had, if any. If it thinks that all the attributes are the same, it
 * will skip any redrawing work. Thus, it's "fine" to recreate these as much as
 * we like.
 *
 * Note that the only difference deck.gl can actually detect is visibility. It
 * explicitly does not check the actual data. That's why the score layer needs
 * special handling, so deck.gl is forced to re-render it on parameter changes.
 *
 * @param {LayerMapValue} layerMapValue
 * @param {string} assetName
 */
function addLayerFromFeatures(layerMapValue, assetName) {
  let colorFxn = getColorOfFeature;
  if (firebaseAssets[assetName]) {
    const colorFxnProperties = firebaseAssets[assetName]['color-fxn'];
    if (colorFxnProperties['single-color']) {
      colorFxn = () => colorMap.get(colorFxnProperties['single-color']);
    } else {
      const continuous = colorFxnProperties['continuous'];
      const field = colorFxnProperties['field'];
      const opacity = colorFxnProperties['opacity'];
      colorFxn = continuous ?
          createContinuousFunction(
              field, opacity, colorFxnProperties['min'],
              colorFxnProperties['max'], colorFxnProperties['base-color']) :
          createDiscreteFunction(field, opacity, colorFxnProperties['colors']);
    }
  }
  layerArray[layerMapValue.index] = new deck.GeoJsonLayer({
    id: assetName,
    data: layerMapValue.data,
    pointRadiusMinPixels: 1,
    getRadius: 10,
    // TODO(janakr): deck.gl docs claim that the "color" property should
    // automatically color the features, but it doesn't appear to work:
    // https://deck.gl/#/documentation/deckgl-api-reference/layers/geojson-layer?section=getelevation-function-number-optional-transition-enabled
    getFillColor: colorFxn,
    visible: layerMapValue.displayed,
  });
  redrawLayers();
}

/**
 *
 * @param {String} field
 * @param {number} opacity
 * @param {number} minVal
 * @param {number} maxVal
 * @param {String} color
 * @return {Function}
 */
function createContinuousFunction(field, opacity, minVal, maxVal, color) {
  return (feature) => {
    const value = feature['properties'][field];
    const colorRgb = colorMap.get(color);
    const rgba = [];
    for (let i = 0; i < 3; i++) {
      rgba.push(
          ((colorRgb[i] * (value - minVal)) + (white[i] * (maxVal - value))) /
          2);
    }
    rgba.push(opacity);
    return rgba;
  };
}

/**
 *
 * @param {string} field
 * @param {number} opacity
 * @param {Map<String, String>} colors
 * @return {Function}
 */
function createDiscreteFunction(field, opacity, colors) {
  // TODO: allow for a default color if field value color isn't specified.
  return (feature) => {
    const color = colors[feature['properties'][field]];
    const rgba = colorMap.get(color);
    rgba.push(opacity);
    return rgba;
  };
}

const colorMap = new Map([
  ['red', [255, 0, 0]],
  ['orange', [255, 140, 0]],
  ['yellow', [255, 255, 0]],
  ['green', [0, 255, 0]],
  ['blue', [0, 0, 255]],
  ['purple', [128, 0, 128]],
  ['black', [0, 0, 0]],
]);

const white = [255, 255, 255];
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

// 250M objects in a FeatureCollection ought to be enough for anyone.
const maxNumFeaturesExpected = 250000000;

/**
 * Convenience wrapper for addLayerFromGeoJsonPromise.
 *
 * @param {string} assetName Name of EarthEngine FeatureCollection.
 * @param {number} index Ordering of layer (higher is more visible).
 * @param {google.maps.Map} map main map
 */
function addLayer(assetName, index, map) {
  // TODO: move image assets to firestore
  if (assets[assetName]) {
    addImageLayer(map, ee.Image(assetName), assetName, index);
  } else if (firebase[assetName]) {
    addLayerFromGeoJsonPromise(
        convertEeObjectToPromise(
            ee.FeatureCollection(assetName).toList(maxNumFeaturesExpected)),
        assetName, index);
  }
}

/**
 * Asynchronous wrapper for addLayerFromFeatures that takes in a Promise coming
 * from an ee.List of Features to avoid blocking on the result. This also
 populates layerMap.
 *
 * This should only be called once per asset when its data is initialized
 * for the first time. After the data is non-null in layerMap, any displaying
 * should be able to set its visibility and redraw the layers.
 *
 * @param {Promise<Array<GeoJson>>}featuresPromise
 * @param {string} assetName
 * @param {number} index Ordering of layer (higher is more visible)
 */
function addLayerFromGeoJsonPromise(featuresPromise, assetName, index) {
  addLoadingElement(mapContainerId);
  // Add entry to map.
  const layerMapValue = new LayerMapValue(null, index, true);
  layerMap.set(assetName, layerMapValue);
  featuresPromise
      .then((features) => {
        layerMapValue.data = features;
        addLayerFromFeatures(layerMapValue, assetName);
        loadingElementFinished(mapContainerId);
      })
      .catch(createError('Error rendering ' + assetName));
}

/**
 * Adds an entry to layerMap when we haven't actually gotten the data yet.
 * Useful for assets that we don't want to display by default.
 *
 * @param {string} assetName
 * @param {number} index
 */
function addNullLayer(assetName, index) {
  layerMap.set(assetName, new LayerMapValue(null, index, false));
}

/**
 * Dumb function that just returns true if its input is not null, for a filter.
 *
 * @param {Object} val
 * @return {boolean}
 */
function valIsNotNull(val) {
  return val !== null;
}

/**
 * Sets the "layers" attribute of deckGlOverlay to the non-null elements of
 * layerArray, which has the effect of redrawing it on the map.
 */
function redrawLayers() {
  deckGlOverlay.setProps({layers: layerArray.filter(valIsNotNull)});
}

/**
 * Removes an entry from the map by setting its displayed attribute to false and
 * recreating the layer.
 *
 * @param {string} assetName
 * @param {google.maps.Map} map main map
 */
function removeLayer(assetName, map) {
  // TODO: move image assets to firestore
  if (assets[assetName]) {
    map.overlayMapTypes.setAt(layerMap[assetName].index, null);
    layerMap[assetName].displayed = false;
  } else if (firebaseAssets[assetName]) {
    switch (firebaseAssets['asset-type']) {
      case 1:
        const layerMapValue = layerMap.get(assetName);
        layerMapValue.displayed = false;
        addLayerFromFeatures(layerMapValue, assetName);
        break;
      default:
        break;
    }
  }
}

/**
 * Removes the score layer before a parameter update. Must actually be
 * removed, not just made invisible, because deck.gl would otherwise not notice
 * any actual data changes, and therefore not update the map.
 */
function removeScoreLayer() {
  layerArray[layerMap.get(scoreLayerName).index] = null;
  redrawLayers();
}
