import {mapContainerId} from './dom_constants.js';
import {terrainStyle} from './earth_engine_asset.js';
import {createError} from './error.js';
import {colorMap, getStyleFunction, LayerType} from './firebase_layers.js';
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
export {deckGlArray, DisplayedLayerData, mapOverlayArray};

const scoreLayerName = 'score';

/**
 * All map overlay layers. Data is lazily generated i.e. pre-known layers that
 * don't display by default will have an entry in this map, but the
 * DisplayedLayerData will have a null data field until we fetch the data when the
 * user wants to display it. Score layer gets its own special 'score' index.
 */
const mapOverlayArray = [];

/**
 * deck.gl layers, in the order they should be rendered. Passed to deckGlOverlay
 * in redrawLayers() (after filtering out absent elements).
 *
 * Contains one GeoJsonLayer per DisplayedLayerData with non-null data attribute
 * (from mapOverlayArray), ordered by DisplayedLayerData.index.
 *
 * @type {Array<deck.GeoJsonLayer>}
 */
const deckGlArray = [];

/**
 * Container for all deck.gl layers. Initialized lazily so tests can load file
 * without deck being defined yet.
 */
let deckGlOverlay;

/**
 * Values of mapOverlayArray. In addition to minimal data from constructor, will
 * have a data attribute for deck layers, and an overlay attribute for map
 * overlay layers.
 */
class DisplayedLayerData {
  /**
   * Constructor.
   *
   * @param {!string} deckId id when rendered with deck. Null for other layers
   * @param {boolean} displayed True if layer is currently displayed
   */
  constructor(deckId, displayed) {
    /** @const */
    this.deckId = deckId;
    this.displayed = displayed;
  }

  /**
   * @return {boolean} True if this layer is rendered using deck
   */
  deckRendered() {
    return this.deckId != null;
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
 * @param {Object} layer
 * @param {google.maps.Map} map main map
 */
function toggleLayerOn(layer, map) {
  const index = layer['index'];
  const layerMapValue = mapOverlayArray[index];
  layerMapValue.displayed = true;
  if (layerMapValue.data) {
    addLayerFromFeatures(layerMapValue, index);
  } else {
    addLayer(layer, map);
  }
}

/**
 * Toggles off displaying an asset on the map. Sets its displayed attribute
 * to false, and recreates the layer (for deck) or removes it from overlay array
 * (for others).
 * @param {number} index
 * @param {google.maps.Map} map main map
 */
function toggleLayerOff(index, map) {
  const layerMapValue = mapOverlayArray[index];
  layerMapValue.displayed = false;
  if (layerMapValue.deckRendered()) {
    addLayerFromFeatures(layerMapValue, index);
  } else {
    map.overlayMapTypes.setAt(index, null);
  }
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
 * to avoid blocking on the result. This also populates mapOverlayArray.
 *
 * This should only be called once per asset when its overlay is initialized
 * for the first time. After the overlay is non-null in mapOverlayArray, any
 * displaying should be able to call {@code map.overlayMapTypes.setAt(...)}.
 *
 * @param {google.maps.Map} map
 * @param {ee.Element} imageAsset
 * @param {Object} layer
 */
function addImageLayer(map, imageAsset, layer) {
  const imgStyles = layer['vis-params'];
  if (layer['use-terrain-style']) {
    imageAsset = terrainStyle(imageAsset);
  }
  const index = layer['index'];
  mapOverlayArray[index] = new DisplayedLayerData(null, true);
  imageAsset.getMap({
    visParams: imgStyles,
    callback: (layerId, failure) => {
      if (layerId) {
        mapOverlayArray[index].overlay = addLayerFromId(
            map, layer['ee-name'], layerId, index,
            mapOverlayArray[index].displayed);
      } else {
        // TODO: if there's an error, disable checkbox, add tests for this.
        mapOverlayArray[index].displayed = false;
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
      mapOverlayArray[index].loading = false;
    } else if (!mapOverlayArray[index].loading) {
      mapOverlayArray[index].loading = true;
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
 * proud of its "reactive" nature. What that means here is that when deckGlArray
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
 * @param {DisplayedLayerData} layerMapValue
 * @param {number|string} index
 */
function addLayerFromFeatures(layerMapValue, index) {
  deckGlArray[index] = new deck.GeoJsonLayer({
    id: layerMapValue.deckId,
    data: layerMapValue.data,
    pointRadiusMinPixels: 1,
    getRadius: 10,
    // TODO(janakr): deck.gl docs claim that the "color" property should
    // automatically color the features, but it doesn't appear to work:
    // https://deck.gl/#/documentation/deckgl-api-reference/layers/geojson-layer?section=getelevation-function-number-optional-transition-enabled
    getFillColor: index === scoreLayerName ? getColorOfFeature :
                                             getStyleFunction(index),
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
 * @param {Object} layer Asset
 * @param {google.maps.Map} map main map
 */
function addLayer(layer, map) {
  switch (layer['asset-type']) {
    case LayerType.IMAGE:
      addImageLayer(map, ee.Image(layer['ee-name']), layer);
      break;
    case LayerType.IMAGE_COLLECTION:
      addImageLayer(map, processImageCollection(layer['ee-name']), layer);
      break;
    case LayerType.FEATURE:
    case LayerType.FEATURE_COLLECTION:
      const layerName = layer['ee-name'];
      addLayerFromGeoJsonPromise(
          convertEeObjectToPromise(
              ee.FeatureCollection(layerName).toList(maxNumFeaturesExpected)),
          layer['ee-name'], layer['index']);
      break;
    default:
      createError('parsing layer type during add')(
          '[' + layer['index'] + ']: ' + layer['asset-name'] +
          ' not recognized layer type');
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
 populates mapOverlayArray.
 *
 * This should only be called once per asset when its data is initialized
 * for the first time. After the data is non-null in mapOverlayArray, any
 displaying
 * should be able to set its visibility and redraw the layers.
 *
 * @param {Promise<Array<GeoJson>>}featuresPromise
 * @param {string} layerName
 * @param {number|string} index Ordering of layer (higher is more visible). The
 *     special string 'score' keeps this always on top (only for the score
 layer)
 */
function addLayerFromGeoJsonPromise(featuresPromise, layerName, index) {
  addLoadingElement(mapContainerId);
  // Add entry to map.
  const layerMapValue = new DisplayedLayerData(layerName, true);
  mapOverlayArray[index] = layerMapValue;
  featuresPromise
      .then((features) => {
        layerMapValue.data = features;
        addLayerFromFeatures(layerMapValue, index);
        loadingElementFinished(mapContainerId);
      })
      .catch(createError('Error rendering ' + layerName));
}

/**
 * Adds an entry to mapOverlayArray when we haven't actually gotten the data
 * yet. Useful for layers that we don't want to display by default.
 *
 * @param {Object} layer
 */
function addNullLayer(layer) {
  const assetType = layer['asset-type'];
  mapOverlayArray[layer['index']] = new DisplayedLayerData(
      assetType === LayerType.FEATURE ||
              assetType === LayerType.FEATURE_COLLECTION ?
          layer['ee-name'] :
          null,
      false);
}

/**
 * Sets the "layers" attribute of deckGlOverlay to the non-null elements of
 * deckGlArray, which has the effect of redrawing it on the map.
 */
function redrawLayers() {
  deckGlOverlay.setProps({layers: processLayerArray()});
}

/**
 * Filters out null elements and appends element at 'score' to end of filtered
 * array.
 * @return {deck.GeoJsonLayer[]}
 */
function processLayerArray() {
  const filteredArray = deckGlArray.filter(valIsNotNull);
  if (deckGlArray['score']) {
    filteredArray.push(deckGlArray['score']);
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
 * Removes the score layer before a parameter update. Must actually be
 * removed, not just made invisible, because deck.gl would otherwise not notice
 * any actual data changes, and therefore not update the map.
 */
function removeScoreLayer() {
  deckGlArray[mapOverlayArray[scoreLayerName]] = null;
  redrawLayers();
}
