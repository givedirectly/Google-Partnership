import drawTable from './draw_table.js';
import highlightFeatures from './highlight_features.js';
import {addLayer, addNullLayer, toggleLayerOff, toggleLayerOn} from './layer_util.js';
import processJoinedData from './process_joined_data.js';
import {createToggles, initialDamageThreshold, initialPovertyThreshold, initialPovertyWeight} from './update.js';

export {
  createAndDisplayJoinedData,
  run as default,
  scoreLayerName,
};

// Dictionary of known assets -> whether they should be displayed by default
const assets = {
  'users/janak/FEMA_Damage_Assessments_Harvey_20170829': true,
};

const joinedSnapAsset = 'users/janak/texas-snap-join-damage-with-buildings';
const scalingFactor = 100;
const scoreIndex = Object.keys(assets).length;
const scoreLayerName = 'score';

/**
 * Main function that processes the known assets (FEMA damage, etc., SNAP) and
 * creates/populates the map and table.
 *
 * @param {google.maps.Map} map main map
 */
function run(map) {
  initializeAssetLayers(map);
  createToggles(map);
  createAssetCheckboxes(map);
  createAndDisplayJoinedData(
      map, initialPovertyThreshold, initialDamageThreshold,
      initialPovertyWeight);
}

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
  const processedData = processJoinedData(
      ee.FeatureCollection(joinedSnapAsset), ee.Number(scalingFactor),
      povertyThreshold, damageThreshold, povertyWeight);
  initializeScoreLayer(map, processedData);
  google.charts.setOnLoadCallback(
      () => drawTable(
          processedData, (features) => highlightFeatures(features, map)));
}

/**
 * Creates checkboxes for all known assets and the score overlay.
 *
 * @param {google.maps.Map} map main map
 */
function createAssetCheckboxes(map) {
  // TODO: these probably shouldn't just sit at the bottom of the page - move to
  // a better place.
  const mapDiv = document.getElementsByClassName('map').item(0);
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
      toggleLayerOn(map, assetName);
    } else {
      toggleLayerOff(map, assetName);
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
  Object.keys(assets).forEach(function(assetName, index) {
    // TODO(juliexxia): generalize for ImageCollections (and Features/Images?)
    if (assets[assetName]) {
      addLayer(map, ee.FeatureCollection(assetName), assetName, index);
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
  addLayer(
      map, layer.style({styleProperty: 'style'}), scoreLayerName, scoreIndex);
  document.getElementById(scoreLayerName).checked = true;
}
