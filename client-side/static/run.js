import drawTable from './draw_table.js';
import {addLayer, addNullLayer} from './layer_util.js';
import processJoinedData from './process_joined_data.js';

export {
  createAndDisplayJoinedData,
  priorityLayerName,
  run as default,
};

// Dictionary of known assets -> whether they should be displayed by default
const assets = {
  'users/janak/FEMA_Damage_Assessments_Harvey_20170829': true,
};

const joinedSnapAsset = 'users/janak/texas-snap-join-damage-with-buildings';
const scalingFactor = 100;
const priorityIndex = Object.keys(assets).length;
const priorityLayerName = 'priority';

/**
 * Main function that processes the known assets (FEMA damage, etc., SNAP) and
 * creates/populates the map and table.
 *
 * @param {google.maps.Map} map main map
 */
function run(map) {
  createAssetCheckboxes();
  initializeAssetLayers(map);
  createAndDisplayJoinedData(map, /* defaultPovertyThreshold=*/ 0.3);
}

/**
 * Creates the priority overlay and draws the table
 *
 * @param {google.maps.Map} map main map
 * @param {number} povertyThreshold a number between 0 and 1 representing what
 *     fraction of the population must be SNAP eligible to be considered.
 */
function createAndDisplayJoinedData(map, povertyThreshold) {
  const processedData = processJoinedData(
      ee.FeatureCollection(joinedSnapAsset), ee.Number(scalingFactor),
      povertyThreshold);
  initializePriorityLayer(map, processedData);
  google.charts.setOnLoadCallback(() => drawTable(processedData));
}

/** Creates checkboxes for all known assets and the priority overlay. */
function createAssetCheckboxes() {
  // TODO: these probably shouldn't just sit at the bottom of the page - move to
  // a better place.
  // TODO(juliexxia): add events on click.
  Object.keys(assets).forEach((assetName) => createNewCheckbox(assetName));
  createNewCheckbox(priorityLayerName);
}

/**
 * Creates a new checkbox for the given asset.
 *
 * @param {string} assetName
 */
function createNewCheckbox(assetName) {
  const newBox = document.createElement('input');
  newBox.type = 'checkbox';
  newBox.id = assetName;
  document.body.appendChild(newBox);
  const label = document.createElement('label');
  label.for = assetName;
  label.innerHTML = assetName;
  document.body.appendChild(label);
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
 * Creates and displays overlay for priority + adds layerMap entry. The priority
 * layer sits at the index of (# regular assets) i.e. the last index. Once we
 * add dynamically addable layers, it might be easier book keeping to have
 * priority sit at index 0, but having it last ensures it displays on top.
 *
 * @param {google.maps.Map} map main map
 * @param {ee.FeatureCollection} layer the computed priority features
 */
function initializePriorityLayer(map, layer) {
  addLayer(
      map, layer.style({styleProperty: 'style'}), priorityLayerName,
      priorityIndex);
}
