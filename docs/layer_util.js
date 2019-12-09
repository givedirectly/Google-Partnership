import {CompositeImageMapType} from './composite_image_map_type.js';
import {mapContainerId} from './dom_constants.js';
import {terrainStyle} from './earth_engine_asset.js';
import {createError} from './error.js';
import {colorMap, createStyleFunction, LayerType} from './firebase_layers.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {convertEeObjectToPromise} from './map_util.js';

export {
  addLayer,
  addNullLayer,
  addScoreLayer,
  DeckParams,
  redrawLayers,
  removeScoreLayer,
  scoreLayerName,
  setMapToDrawLayersOn,
  toggleLayerOff,
  toggleLayerOn,
};
// @VisibleForTesting
export {deckGlArray, layerArray, LayerDisplayData};

const scoreLayerName = 'score';

/**
 * All map overlay layers. Data is lazily generated: layers that don't display
 * by default will have an entry in this map, but the LayerDisplayData will
 * have a null data/overlay field (depending on whether or not we render it with
 * deck) until we fetch the data when the user wants to display it. Score layer
 * gets its own special 'score' index, exploiting Javascript's tolerance for
 * non-numerical indices on arrays.
 */
const layerArray = [];

/**
 * deck.gl layers, in the order they should be rendered. Passed to deckGlOverlay
 * in redrawLayers() (after filtering out absent elements).
 *
 * Contains one GeoJsonLayer per LayerDisplayData with non-null data attribute
 * (from layerArray), ordered by LayerDisplayData.index. Same trick as with
 * layerArray for score index.
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
 * Values of layerArray. In addition to basic data from constructor, will
 * have a data attribute for deck layers, and an overlay attribute for
 * image/other layers. Will also have a "pendingPromise" field to detect if an
 * initial rendering operation is currently in flight.
 *
 * There are three kinds of layers, corresponding to different types of source
 * data:
 * 1. Features/FeatureCollections are rendered using deck. They will have a
 * "loading" status until their EarthEngine computation completes, and then
 * render near-instantly. These have non-null deckParams, and a pendingPromise
 * until the EarthEngine computation is finished.
 * 2. Images/ImageCollections are rendered using EarthEngine. They will have a
 * "loading" status until their #getMap() call completes *and* their tiles have
 * been rendered. These have null deckParams, and a pendingPromise until tiles
 * are rendered. On map pan/zoom or layer toggling, the EarthEngine computation
 * is cached, but the tile rendering triggers a "loading" status.
 * 3. Map tiles are rendered using CompositeImageMapType. They start rendering
 * once their associated .json files (if present) have downloaded, and are
 * "loading" until all the tiles have been fetched. These have null deckParams,
 * and have a pendingPromise until any .json files have downloaded.
 *
 * FeatureCollections have a computation phase but no rendering phase;
 * ImageCollections have both computation and rendering phases, and
 * CompositeImageMapTypes also have both, in which "computation" is .json
 * download.
 */
class LayerDisplayData {
  /**
   * @constructor
   *
   * @param {DeckParams} deckParams null if not rendered using deck
   * @param {boolean} displayed True if layer is currently displayed
   * @param {?boolean} isKmlLayer, true if this layer is a KML layer
   */
  constructor(deckParams, displayed, isKmlLayer) {
    /** @const */
    this.deckParams = deckParams;
    this.displayed = displayed;
    this.isKmlLayer = isKmlLayer;
  }

  /**
   * @return {boolean} True if this layer is rendered using deck
   */
  deckRendered() {
    return this.deckParams != null;
  }

  /** @return {boolean} True if this layer is a KML layer */
  isLayerKml() {
    return this.isKmlLayer;
  }
}

/**
 * Utility class to group deck parameters together, and cache computed color
 * function.
 */
class DeckParams {
  /**
   * @constructor
   *
   * @param {!string} deckId deck id: must be unique
   * @param {Object} colorFunctionProperties Parameters used to calculate color
   *     function
   */
  constructor(deckId, colorFunctionProperties) {
    /** @const */
    this.deckId = deckId;
    /** @const */
    this.colorFunctionProperties = colorFunctionProperties;
  }
}

DeckParams.fromLayer = (layer) => {
  return new DeckParams(layer['ee-name'], layer['color-function']);
};

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
 * @param {Object} layer Data for layer coming from Firestore
 * @param {google.maps.Map} map main map
 * @return {Promise|null} Promise that resolves when layer is rendered, or null
 *     if layer is rendered synchronously
 */
function toggleLayerOn(layer, map) {
  const index = layer['index'];
  const layerDisplayData = layerArray[index];
  layerDisplayData.displayed = true;
  if (layerDisplayData.data) {
    addLayerFromFeatures(layerDisplayData, index);
    return null;
  }
  if (layerDisplayData.overlay && !layerDisplayData.isLayerKml()) {
    // The promise returned in this branch does not need to be stored in the
    // pendingPromise field because it will complete immediately if this layer
    // is toggled off (see the createTileCallback doc). That means that if
    // toggleLayerOn is called again for this layer, the promise will already
    // have completed.
    if (layerDisplayData.overlay instanceof CompositeImageMapType) {
      return createCompositeTilePromise(layerDisplayData, index, map);
    }
    return createLoadingAwarePromise((resolve) => {
      resolveOnEeTilesFinished(layerDisplayData, resolve);
      showOverlayLayer(layerDisplayData.overlay, index, map);
    });
  }
  if (layerDisplayData.pendingPromise) {
    return layerDisplayData.pendingPromise;
  }
  return addLayer(layer, map);
}

/**
 * Toggles off displaying an asset on the map. Sets its displayed attribute
 * to false, and recreates the layer (for deck) or removes it from overlay array
 * (for others).
 * @param {number} index
 * @param {google.maps.Map} map main map
 */
function toggleLayerOff(index, map) {
  const layerDisplayData = layerArray[index];
  layerDisplayData.displayed = false;
  if (layerDisplayData.isLayerKml()) {
    layerDisplayData.overlay.forEach((o) => o.setMap(null));
  } else if (layerDisplayData.deckRendered()) {
    addLayerFromFeatures(layerDisplayData, index);
  } else {
    map.overlayMapTypes.setAt(index, null);
  }
}

/**
 * Asynchronous wrapper for ee.MapLayerOverlay that calls getMap() with a
 * callback to avoid blocking on the result. This also populates layerArray.
 *
 * This should only be called once per asset when its overlay is initialized
 * for the first time. After the overlay is non-null in layerArray, any
 * displaying should be able to call {@code map.overlayMapTypes.setAt(...)}.
 *
 * @param {google.maps.Map} map
 * @param {ee.Element} imageAsset
 * @param {Object} layer Data for layer coming from Firestore
 * @return {Promise} Promise that completes when layer is processed
 */
function addImageLayer(map, imageAsset, layer) {
  const imgStyles = layer['vis-params'];
  if (layer['use-terrain-style']) {
    imageAsset = terrainStyle(imageAsset);
  }
  const index = layer['index'];
  const layerDisplayData = new LayerDisplayData(null, true);
  layerArray[index] = layerDisplayData;
  layerDisplayData.pendingPromise =
      createLoadingAwarePromise((resolve, reject) => {
        imageAsset.getMap({
          visParams: imgStyles,
          callback: (layerId, failure) => {
            if (layerId) {
              const overlay = new ee.MapLayerOverlay(
                  'https://earthengine.googleapis.com/map', layerId.mapid,
                  layerId.token, {});
              layerDisplayData.overlay = overlay;
              // Check in case the status has changed before this callback was
              // invoked by getMap.
              if (layerDisplayData.displayed) {
                resolveOnEeTilesFinished(layerDisplayData, resolve);
                showOverlayLayer(overlay, index, map);
              } else {
                resolve();
              }
            } else {
              // TODO: if there's an error, disable checkbox, add tests for
              // this.
              layerDisplayData.displayed = false;
              reject(failure);
            }
            layerDisplayData.pendingPromise = null;
          },
        });
      });
  return layerDisplayData.pendingPromise;
}

/**
 * Draws the given overlay on the map.
 * @param {google.maps.MapType} overlay
 * @param {number} index Index of overlay (higher goes on top of lower). Each
 *     layer has a unique index
 * @param {google.maps.Map} map
 */
function showOverlayLayer(overlay, index, map) {
  map.overlayMapTypes.setAt(index, overlay);
}

/**
 * Wrapper for adding {@link createTileCallback} to the given ee.OverlayMapData
 * layer.
 * @param {LayerDisplayData} layerDisplayData containing an ee.OverlayMapData
 * @param {Function} resolve Function to be called the first time this layer
 *     finishes rendering
 */
function resolveOnEeTilesFinished(layerDisplayData, resolve) {
  if (layerDisplayData.tileCallbackId) {
    layerDisplayData.overlay.removeTileCallback(
        layerDisplayData.tileCallbackId);
  }
  layerDisplayData.tileCallbackId = layerDisplayData.overlay.addTileCallback(
      createTileCallback(layerDisplayData, resolve));
}

/**
 * Creates a callback to be registered with either an ee.MapLayerOverlay or
 * CompositeImageMapType. The callback enables/disables the loading status
 * indefinitely (on map pan/zoom), but will call the given resolve function the
 * first time loading completes, so that the application can be notified that
 * this layer has been rendered.
 *
 * On subsequent calls, adds loading element to map if not already loading, and
 * removes it when all tiles are loaded. These calls correspond to map redraws,
 * from pans or zooms.
 *
 * Loading completion will be triggered if the layer is toggled off from the map
 * (verified experimentally, and also through reading code: when the layer is
 * toggled off, releaseTile() is called on all of its tiles, enabling the
 * relevant TileEvent to be sent).
 * @param {LayerDisplayData} layerDisplayData
 * @param {Function} resolve Function to be called the first time this layer
 *     finishes rendering
 * @return {Function} A callback to be passed to
 *     CompositeImageMapType.setTileCallback or
 *     ee.MapLayerOverlay.addTileCallback
 */
function createTileCallback(layerDisplayData, resolve) {
  return (tileEvent) => {
    if (tileEvent.count === 0) {
      if (resolve) {
        // This is the first time we've finished loading, so inform caller.
        resolve();
        // Free up reference to resolve and make future redraws add a
        // loading element.
        resolve = null;
      } else {
        // Loading has finished for a pan/zoom-triggered load.
        loadingElementFinished(mapContainerId);
      }
      layerDisplayData.loading = false;
    } else if (!resolve && !layerDisplayData.loading) {
      // We've started loading again after the first time completed (because
      // of a pan/zoom of the map). Enable loading indicator.
      layerDisplayData.loading = true;
      addLoadingElement(mapContainerId);
    }
  };
}

/**
 * Displays a collection of tiles (given by the 'urls' attribute of layer)
 * on the map using a CompositeImageMapType to combine all tiles for a given
 * map location into one tile.
 *
 * The urls can be either raw urls or .json urls in the form provided by NOAA,
 * like
 * https://storms.ngs.noaa.gov/storms/tilesd/services/tileserver.php?/20170827-rgb.json.
 * In the latter case, the layerDisplayData.overlay object will only be created
 * once all JSONs are downloaded and their corresponding tile urls are
 * retrieved.
 *
 * TODO(janakr): JSON files can tell us map bounds and zoom levels.
 * @param {google.maps.Map} map
 * @param {Object} layer Data for layer coming from Firestore
 * @return {Promise} Promise that resolves when images are all downloaded
 */
function addTileLayer(map, layer) {
  const layerDisplayData = new LayerDisplayData(null, true);
  layerArray[layer['index']] = layerDisplayData;
  const urlPromises = [];
  for (const url of layer['urls']) {
    if (url.match(/{Z}/i) && url.match(/{Y}/i) && url.match(/{X}/i)) {
      urlPromises.push(Promise.resolve(url));
    } else {
      urlPromises.push(extractFromJson(url));
    }
  }
  layerDisplayData.pendingPromise = Promise.all(urlPromises).then((urls) => {
    layerDisplayData.overlay = new CompositeImageMapType({
      // JSON urls each had an array of tile URLS, so flatten them.
      tileUrls: urls.flat(),
      tileSize: layer['tile-size'],
      maxZoom: layer['maxZoom'],
      opacity: layer['opacity'],
    });
    layerDisplayData.pendingPromise = null;
    return createCompositeTilePromise(layerDisplayData, layer['index'], map);
  });
  return layerDisplayData.pendingPromise;
}

/**
 * Downloads a JSON file containing tile URL info under the 'tiles' property and
 * returns those tile URLs. See {@link addTileLayer}.
 * @param {string} jsonUrl
 * @returns {Promise<Array<string>>}
 */
function extractFromJson(jsonUrl) {
  return Promise.resolve($.getJSON(jsonUrl, null)).then((json) => json.tiles);
}

/**
 * Creates a Promise for a CompositeImageMapType that will complete when the
 * layer has rendered (or, at least, when all of its images are downloaded).
 * @param {LayerDisplayData} layerDisplayData
 * @param {number} index Order in the overlay types
 * @param {google.maps.Map} map
 * @return {Promise} Promise that completes when layer is rendered. If the
 *     layer is toggled off, this Promise will complete immediately, see {@link
 *     createTileCallback}
 */
function createCompositeTilePromise(layerDisplayData, index, map) {
  return createLoadingAwarePromise((resolve) => {
    layerDisplayData.overlay.setTileCallback(
        createTileCallback(layerDisplayData, resolve));
    showOverlayLayer(layerDisplayData.overlay, index, map);
  });
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
 * @param {LayerDisplayData} layerDisplayData
 * @param {number|string} index index of layer. A number unless this is the
 * score layer
 */
function addLayerFromFeatures(layerDisplayData, index) {
  const deckParams = layerDisplayData.deckParams;
  if (!deckParams.colorFunction) {
    deckParams.colorFunction =
        createStyleFunction(deckParams.colorFunctionProperties);
  }
  deckGlArray[index] = new deck.GeoJsonLayer({
    // TODO: also add layer index to this id so we don't get duplicate ids from
    // using the same asset for multiple layers.
    id: layerDisplayData.deckParams.deckId,
    data: layerDisplayData.data,
    pointRadiusMinPixels: 1,
    getRadius: 10,
    // TODO(janakr): deck.gl docs claim that the "color" property should
    // automatically color the features, but it doesn't appear to work:
    // https://deck.gl/#/documentation/deckgl-api-reference/layers/geojson-layer?section=getelevation-function-number-optional-transition-enabled
    getFillColor: deckParams.colorFunction,
    visible: layerDisplayData.displayed,
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
 * Convenience wrapper for addLayerFromGeoJsonPromise/addImageLayer
 * @param {Object} layer Data for layer coming from Firestore
 * @param {google.maps.Map} map main map
 * @return {Promise} Promise that completes when layer is processed
 */
function addLayer(layer, map) {
  switch (layer['asset-type']) {
    case LayerType.IMAGE:
      return addImageLayer(map, ee.Image(layer['ee-name']), layer);
    case LayerType.IMAGE_COLLECTION:
      return addImageLayer(
          map, processImageCollection(layer['ee-name']), layer);
    case LayerType.FEATURE:
    case LayerType.FEATURE_COLLECTION:
      const layerName = layer['ee-name'];
      return addLayerFromGeoJsonPromise(
          convertEeObjectToPromise(
              ee.FeatureCollection(layerName).toList(maxNumFeaturesExpected)),
          DeckParams.fromLayer(layer), layer['index']);
    case LayerType.KML:
      return addKmlLayers(layer, map);
    case LayerType.MAP_TILES:
      return addTileLayer(map, layer);
    default:
      createError('parsing layer type during add')(
          '[' + layer['index'] + ']: ' + layer['asset-name'] +
          ' not recognized layer type');
  }
}

/**
 * Displays a collection of kmls (given by the 'urls' attribute of layer)
 * on the map using google.maps.KmlLayer
 * @param {Object} layer Data for layer coming from Firestore
 * @param {google.maps.Map} map
 * @return {Promise} A resolved promise
 */
function addKmlLayers(layer, map) {
  const layerDisplayData = new LayerDisplayData(null, true, true);
  layerArray[layer['index']] = layerDisplayData;
  const overlays = [];
  for (let i = 0; i < layer['urls'].length; i++) {
    overlays.push(new google.maps.KmlLayer(layer['urls'][i], {
      preserveViewport: true,
      map: map,
      clickable: false,
    }));
  }
  layerDisplayData.overlay = overlays;
  return Promise.resolve();
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
 * populates layerArray.
 *
 * This should only be called once per asset when its data is initialized for
 * the first time. After the data is non-null in layerArray, any displaying
 * should be able to set its visibility and redraw the layers.
 *
 * @param {Promise<Array<GeoJson>>}featuresPromise
 * @param {DeckParams} deckParams
 * @param {number|string} index index of layer. A number unless this is the
 * score layer
 * @return {Promise} Promise that completes when the feature is rendered
 */
function addLayerFromGeoJsonPromise(featuresPromise, deckParams, index) {
  const layerDisplayData = new LayerDisplayData(deckParams, true);
  layerArray[index] = layerDisplayData;
  layerDisplayData.pendingPromise =
      wrapPromiseLoadingAware(featuresPromise.then((features) => {
        layerDisplayData.data = features;
        addLayerFromFeatures(layerDisplayData, index);
        layerDisplayData.pendingPromise = null;
      }));
  return layerDisplayData.pendingPromise;
}

/**
 * Adds an entry to layerArray when we haven't actually gotten the data
 * yet. Useful for layers that we don't want to display by default.
 *
 * @param {Object} layer Data for layer coming from Firestore
 */
function addNullLayer(layer) {
  const assetType = layer['asset-type'];
  layerArray[layer['index']] = new LayerDisplayData(
      assetType === LayerType.FEATURE_COLLECTION ||
              assetType === LayerType.FEATURE ?
          DeckParams.fromLayer(layer) :
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
  if (deckGlArray[scoreLayerName]) {
    filteredArray.push(deckGlArray[scoreLayerName]);
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

const scoreDeckParams = new DeckParams(scoreLayerName, null);
scoreDeckParams.colorFunction = (feature) =>
    showColor(feature.properties['color']);

/**
 * Creates and displays overlay for score + adds layerArray entry. The
 * score layer sits at the end of all the layers. Having it last ensures it
 * displays on top.
 *
 * @param {Promise<Array<GeoJson>>} layer
 * @return {Promise} Promise that completes when layer is displayed
 */
function addScoreLayer(layer) {
  return addLayerFromGeoJsonPromise(layer, scoreDeckParams, scoreLayerName);
}

/**
 * Removes the score layer before a parameter update. Must actually be
 * removed, not just made invisible, because deck.gl would otherwise not notice
 * any actual data changes, and therefore not update the map.
 */
function removeScoreLayer() {
  deckGlArray[scoreLayerName] = null;
  redrawLayers();
}

const mapLoadingFinished = () => loadingElementFinished(mapContainerId);

/**
 * Notes that an element has started loading, and add a handler to the Promise
 * to note when it finishes.
 * @param {Promise} promise
 * @return {Promise} wrappedPromise
 */
function wrapPromiseLoadingAware(promise) {
  addLoadingElement(mapContainerId);
  return promise.then(mapLoadingFinished);
}

/**
 * Creates a Promise that's already wrapped by {@code wrapPromiseLoadingAware}.
 * @param {Function} lambda that is the argument to Promise constructor
 * @return {Promise} wrapped Promise
 */
function createLoadingAwarePromise(lambda) {
  return wrapPromiseLoadingAware(new Promise(lambda));
}
