import createError from './create_error.js';
import {mapContainerId} from './dom_constants.js';
import {assets} from './earth_engine_asset.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';

export {
  addLayer,
  addLayerFromGeoJsonPromise,
  addNullLayer,
  convertEeObjectToPromise,
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

/** Container for all deck.gl layers. */
const deckGlOverlay = new deck.GoogleMapsOverlay();

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
  deckGlOverlay.setMap(map);
}

/**
 * Toggles on displaying an asset on the map.
 *
 * @param {string} assetName
 */
function toggleLayerOn(assetName) {
  const currentLayerMapValue = layerMap.get(assetName);
  currentLayerMapValue.displayed = true;
  if (currentLayerMapValue.data) {
    addLayerFromFeatures(currentLayerMapValue, assetName);
  } else {
    addLayer(assetName, currentLayerMapValue.index);
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

/**
 * Function object to extract a color from a JSON Feature.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} RGBA array
 */
function getColorOfFeature(feature, temp, assetName) {
  if (assets[assetName] && assets[assetName].getColorFunction()) {
    assets[assetName].getColorFunction()(feature);
  }
  return showColor(feature.properties['color']);
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
  layerArray[layerMapValue.index] = new deck.GeoJsonLayer({
    id: assetName,
    data: layerMapValue.data,
    pointRadiusScale: 500,
    // TODO(janakr): deck.gl docs claim that the "color" property should
    // automatically color the features, but it doesn't appear to work:
    // https://deck.gl/#/documentation/deckgl-api-reference/layers/geojson-layer?section=getelevation-function-number-optional-transition-enabled
    getFillColor: (feature, temp) =>
        getColorOfFeature(feature, temp, assetName),
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

// 250M objects in a FeatureCollection ought to be enough for anyone.
const maxNumFeaturesExpected = 250000000;

/**
 * Convenience wrapper for addLayerFromGeoJsonPromise.
 *
 * @param {string} assetName Name of EarthEngine FeatureCollection.
 * @param {number} index Ordering of layer (higher is more visible).
 */
function addLayer(assetName, index) {
  addLayerFromGeoJsonPromise(
      convertEeObjectToPromise(
          ee.FeatureCollection(assetName).toList(maxNumFeaturesExpected)),
      assetName, index);
}

// addLayerFromGeoJsonPromise(
//     convertEeObjectToPromise(
//         assets[assetName].getAsset(assetName)).then((featureCollection) => {
//   if (assets[assetName].getColorFunction()) {
//     for (const feature of featureCollection.features) {
//     assets[assetName].getColorFunction()(feature);
//   }
// }
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
 */
function removeLayer(assetName) {
  const layerMapValue = layerMap.get(assetName);
  layerMapValue.displayed = false;
  addLayerFromFeatures(layerMapValue, assetName);
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

/**
 * Transform an EE object into a standard Javascript Promise by wrapping its
 * evaluate call.
 *
 * @param {ee.ComputedObject} eeObject
 * @return {Promise<GeoJson>}
 */
function convertEeObjectToPromise(eeObject) {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((resolvedObject, error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(resolvedObject);
    });
  });
}
