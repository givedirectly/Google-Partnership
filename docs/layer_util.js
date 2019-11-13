import {mapContainerId} from './dom_constants.js';
import {terrainStyle} from './earth_engine_asset.js';
import {createError} from './error.js';
import {colorMap, firebaseLayers, getStyleFunction, LayerType} from './firebase_layers.js';
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
 * Keep a map of layer name -> data, index, display status. Data is lazily
 * generated i.e. pre-known layers that don't display by default will have an
 * entry in this map, but the LayerMapValue will have a null data field until we
 * fetch the data when the user wants to display it.
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
   * @param {number|string} index Z-index of layer when displayed. Does not
   *     change.
   *   Number except for the magic string 'lastElement', which always keeps this
   *   layer on top (used for the score layer)
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
 * @param {string} layerName
 * @param {google.maps.Map} map main map
 */
function toggleLayerOn(layerName, map) {
  const currentLayerMapValue = layerMap.get(layerName);
  currentLayerMapValue.displayed = true;
  if (currentLayerMapValue.data) {
    addLayerFromFeatures(currentLayerMapValue, layerName);
  } else {
    addLayer(layerName, currentLayerMapValue.index, map);
  }
}

/**
 * Toggles off displaying an asset on the map.
 *
 * @param {string} layerName
 * @param {google.maps.Map} map main map
 */
function toggleLayerOff(layerName, map) {
  removeLayer(layerName, map);
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
 * @param {ee.Element} imageAsset
 * @param {Object} layer
 * @param {number} index
 */
function addImageLayer(map, imageAsset, layer, index) {
  const imgStyles = layer['vis-params'];
  if (layer['use-terrain-style']) {
    imageAsset = terrainStyle(imageAsset);
  }
  // Add a null-overlay entry to layerMap while waiting for the callback to
  // finish.
  const layerName = layer['ee-name'];
  layerMap[layerName] = new LayerMapValue(null, index, true);
  imageAsset.getMap({
    visParams: imgStyles,
    callback: (layerId, failure) => {
      if (layerId) {
        layerMap[layerName].overlay = addLayerFromId(
            map, layerName, layerId, index, layerMap[layerName].displayed);
      } else {
        // TODO: if there's an error, disable checkbox, add tests for this.
        layerMap[layerName].displayed = false;
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
 * @param {string} layerName
 * @param {Object} layerId
 * @param {number} index
 * @param {boolean} displayed
 * @return {ee.MapLayerOverlay}
 */
function addLayerFromId(map, layerName, layerId, index, displayed) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map', layerId.mapid, layerId.token,
      {});
  // Update loading state according to layers.
  overlay.addTileCallback((tileEvent) => {
    if (tileEvent.count == 0) {
      loadingElementFinished(mapContainerId);
      layerMap[layerName].loading = false;
    } else if (!layerMap[layerName].loading) {
      layerMap[layerName].loading = true;
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
 * @param {string} layerName
 */
function addLayerFromFeatures(layerMapValue, layerName) {
  layerArray[layerMapValue.index] = new deck.GeoJsonLayer({
    id: layerName,
    data: layerMapValue.data,
    pointRadiusMinPixels: 1,
    getRadius: 10,
    // TODO(janakr): deck.gl docs claim that the "color" property should
    // automatically color the features, but it doesn't appear to work:
    // https://deck.gl/#/documentation/deckgl-api-reference/layers/geojson-layer?section=getelevation-function-number-optional-transition-enabled
    getFillColor: layerName === scoreLayerName ? getColorOfFeature :
                                                 getStyleFunction(layerName),
    visible: layerMapValue.displayed,
  });
  redrawLayers();
}

/**
 * Utility function to return the given color if defined, or black if undefined.
 *
 * @param {Array} color RGBA color specification as an array, or undefined/null
 * @return {Array} RGBA color specification as an array
 */
function showColor(color) {
  return color ? color : colorMap.get('black');
}

// 250M objects in a FeatureCollection ought to be enough for anyone.
const maxNumFeaturesExpected = 250000000;

/**
 * Convenience wrapper for addLayerFromGeoJsonPromise.
 * @param {string} layer Asset
 * @param {number} index Ordering of layer (higher is more visible)
 * @param {google.maps.Map} map main map
 */
function addLayer(layer, index, map) {
  switch (layer['asset-type']) {
    case LayerType.IMAGE:
      addImageLayer(map, ee.Image(layer['ee-name']), layer, index);
      break;
    case LayerType.IMAGE_COLLECTION:
      addImageLayer(map, processImageCollection(layer['ee-name']), layer, index);
      break;
    case LayerType.FEATURE:
    case LayerType.FEATURE_COLLECTION:
      const layerName = layer['ee-name'];
      addLayerFromGeoJsonPromise(
          convertEeObjectToPromise(
              ee.FeatureCollection(layerName).toList(maxNumFeaturesExpected)),
          layer['ee-name'], index);
      break;
    default:
      createError('parsing layer type during add')(
          '[' + index + ']: ' + layer + ' not recognized layer type');
  }
}

/**
 * Given a layer name, turns it into an ImageCollection. Masks images with
 * themselves to avoid displaying black pixels (which are usually just points
 * that weren't captured by the imagery).
 * @param {string} layerName Name of ImageCollection
 * @return {ee.ImageCollection}
 */
function processImageCollection(layerName) {
  return ee.ImageCollection(layerName).map((image) => image.selfMask());
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
 * @param {string} layerName
 * @param {number|string} index Ordering of layer (higher is more visible). The
 *     special string 'lastElement' keeps this always on top (only for the score
 layer)
 */
function addLayerFromGeoJsonPromise(featuresPromise, layerName, index) {
  addLoadingElement(mapContainerId);
  // Add entry to map.
  const layerMapValue = new LayerMapValue(null, index, true);
  layerMap.set(layerName, layerMapValue);
  featuresPromise
      .then((features) => {
        layerMapValue.data = features;
        addLayerFromFeatures(layerMapValue, layerName);
        loadingElementFinished(mapContainerId);
      })
      .catch(createError('Error rendering ' + layerName));
}

/**
 * Adds an entry to layerMap when we haven't actually gotten the data yet.
 * Useful for layers that we don't want to display by default.
 *
 * @param {string} layerName
 * @param {number} index
 */
function addNullLayer(layerName, index) {
  layerMap.set(layerName, new LayerMapValue(null, index, false));
}

/**
 * Sets the "layers" attribute of deckGlOverlay to the non-null elements of
 * layerArray, which has the effect of redrawing it on the map.
 */
function redrawLayers() {
  deckGlOverlay.setProps({layers: processLayerArray()});
}

/**
 * Filters out null elements and appends element at 'lastElement' to end of
 * filtered array.
 * @return {deck.GeoJsonLayer[]}
 */
function processLayerArray() {
  const filteredArray = layerArray.filter(valIsNotNull);
  if (layerArray['lastElement']) {
    filteredArray.push(layerArray['lastElement']);
  }
  return filteredArray;
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
 * Removes an entry from the map by setting its displayed attribute to false and
 * recreating the layer.
 *
 * @param {string} layerName
 * @param {google.maps.Map} map main map
 */
function removeLayer(layerName, map) {
  if (layerName === scoreLayerName) {
    removeFeatureCollection(layerName);
    return;
  }
  switch (firebaseLayers[layerName]['asset-type']) {
    case LayerType.IMAGE:
    case LayerType.IMAGE_COLLECTION:
      map.overlayMapTypes.setAt(layerMap[layerName].index, null);
      layerMap[layerName].displayed = false;
      break;
    case LayerType.FEATURE:
    case LayerType.FEATURE_COLLECTION:
      removeFeatureCollection(layerName);
      break;
    default:
      createError('parsing layer type during remove')(
          '[' + index + ']: ' + layerName + ' not recognized layer type');
  }
}

/**
 * convenience function for removeLayer on feature collections.
 * @param {string} layerName
 */
function removeFeatureCollection(layerName) {
  const layerMapValue = layerMap.get(layerName);
  layerMapValue.displayed = false;
  addLayerFromFeatures(layerMapValue, layerName);
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
