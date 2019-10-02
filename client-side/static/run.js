import {clickFeature, selectHighlightedFeatures} from './click_feature.js';
import {mapContainerId, tableContainerId} from './dom_constants.js';
import {drawTable} from './draw_table.js';
import {highlightFeatures} from './highlight_features.js';
import {addLayerFromGeoJsonPromise, addNullLayer, scoreLayerName, setMap, toggleLayerOff, toggleLayerOn} from './layer_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {processUserRegions} from './polygon_draw.js';
import processJoinedData from './process_joined_data.js';
import {createToggles, initialDamageThreshold, initialPovertyThreshold, initialPovertyWeight} from './update.js';

export {
  createAndDisplayJoinedData,
  run as default,

};

// Dictionary of known assets -> whether they should be displayed by default
const assets = {
  'users/juliexxia/harvey-damage-crowdai-format': true,
};

// TODO: infer this from disaster const in import_data.js?
const snapAndDamageAsset = 'users/janak/harvey-snap-and-damage';
let snapAndDamagePromise;
const scalingFactor = 100;
const scoreIndex = Object.keys(assets).length;

/**
 * Main function that processes the known assets (FEMA damage, etc., SNAP) and
 * creates/populates the map and table.
 *
 * @param {google.maps.Map} map main map
 */
function run(map) {
  setMap(map);
  initializeAssetLayers(map);
  createToggles(map);
  createAssetCheckboxes(map);
  snapAndDamagePromise =
      convertEeObjectToPromise(ee.FeatureCollection(snapAndDamageAsset));
  createAndDisplayJoinedData(
      map, initialPovertyThreshold, initialDamageThreshold,
      initialPovertyWeight);
  processUserRegions(map);
}

let mapSelectListener = null;
let featureSelectListener = null;

/**
 * Creates the score overlay and draws the table
 *
 * @param {google.maps.Map} map main map
 * @param {number} povertyThreshold a number between 0 and 1 representing what
 *     fraction of the population must be SNAP eligible to be considered.
 * @param {number} damageThreshold a number between 0 and 1 representing what
 *     fraction of a block group's building must be damaged to be considered.
 * @param {number} povertyWeight float between 0 and 1 that describes what
 *     percentage of the score should be based on poverty (this is also a proxy
 *     for damageWeight which is 1-this value).
 */
function createAndDisplayJoinedData(
    map, povertyThreshold, damageThreshold, povertyWeight) {
  addLoadingElement(tableContainerId);
  // clear old listeners
  google.maps.event.removeListener(mapSelectListener);
  google.maps.event.removeListener(featureSelectListener);
  const processedData = processJoinedData(
      snapAndDamagePromise, scalingFactor, povertyThreshold, damageThreshold,
      povertyWeight);
  initializeScoreLayer(map, processedData);
  drawTable(
      processedData, (features) => highlightFeatures(features, map),
      (table, tableData) => {
        loadingElementFinished(tableContainerId);
        // every time we get a new table and data, reselect elements in the
        // table based on {@code currentFeatures} in highlight_features.js.
        selectHighlightedFeatures(table, tableData);
        // TODO: handle ctrl+click situations
        mapSelectListener = map.addListener('click', (event) => {
          clickFeature(
              event.latLng.lng(), event.latLng.lat(), map, snapAndDamageAsset,
              table, tableData);
        });
        // map.data covers clicks to map areas underneath map.data so we need
        // two listeners
        featureSelectListener = map.data.addListener('click', (event) => {
          clickFeature(
              event.latLng.lng(), event.latLng.lat(), map, snapAndDamageAsset,
              table, tableData);
        });
      });
}

/**
 * Creates checkboxes for all known assets and the score overlay.
 *
 * @param {google.maps.Map} map main map
 */
function createAssetCheckboxes(map) {
  // TODO: these probably shouldn't just sit at the bottom of the page - move to
  // a better place.
  const mapDiv = document.getElementById(mapContainerId);
  Object.keys(assets).forEach(
      (assetName) => createNewCheckbox(assetName, map, mapDiv));
  // score checkbox gets checked during initializeScoreLayer
  createNewCheckbox(scoreLayerName, map, mapDiv);
}

/**
 * Creates a new checkbox for the given asset.
 *
 * @param {string} assetName
 * @param {google.maps.Map} map main map
 * @param {Element} mapDiv
 */
function createNewCheckbox(assetName, map, mapDiv) {
  const newBox = document.createElement('input');
  newBox.type = 'checkbox';
  newBox.id = assetName;
  if (assets[assetName]) {
    newBox.checked = true;
  }
  newBox.onclick = () => {
    if (newBox.checked) {
      toggleLayerOn(assetName);
    } else {
      toggleLayerOff(assetName);
    }
  };
  mapDiv.parentNode.appendChild(newBox);
  const label = document.createElement('label');
  label.for = assetName;
  label.innerHTML = assetName;
  mapDiv.parentNode.appendChild(label);
}

/**
 * Runs through asset map. For those that we auto-display on page load, creates
 * overlays and displays. Also populates the layerMap.
 *
 * @param {google.maps.Map} map main map
 */
function initializeAssetLayers(map) {
  // This is the standard way to iterate over a dictionary according to
  // https://stackoverflow.com/questions/34448724/iterating-over-a-dictionary-in-javascript

  Object.keys(assets).forEach((assetName, index) => {
    // TODO(juliexxia): generalize for ImageCollections (and Features/Images?)
    if (assets[assetName]) {
      // 250M objects in a FeatureCollection ought to be enough for anyone.
      addLayerFromGeoJsonPromise(
          convertEeObjectToPromise(
              ee.FeatureCollection(assetName).toList(250000000)),
          assetName, index);
    } else {
      addNullLayer(assetName, index);
    }
  });
}

/**
 * Creates and displays overlay for score + adds layerMap entry. The score
 * layer sits at the index of (# regular assets) i.e. the last index. Once we
 * add dynamically addable layers, it might be easier book keeping to have
 * score sit at index 0, but having it last ensures it displays on top.
 *
 * @param {google.maps.Map} map main map
 * @param {ee.FeatureCollection} layer the computed score features
 */
function initializeScoreLayer(map, layer) {
  addLayerFromGeoJsonPromise(layer, scoreLayerName, scoreIndex);
  document.getElementById(scoreLayerName).checked = true;
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
