import drawTable from './draw_table.js';
import processJoinedData from './process_joined_data.js';
import {addLayer} from './layer_util.js';
import {eeConstants, map} from './script.js';

export {
  run as default,
  initializePriorityLayer,
  layerMap,
  LayerMapValue,
  priorityLayerName,
};

// Dictionary of known assets -> whether they should be displayed by default
const assets = {
  'users/janak/FEMA_Damage_Assessments_Harvey_20170829': true,
};

const priorityIndex = Object.keys(assets).length;
const priorityLayerName = 'priority';
// Keep a map of asset name -> overlay, index, display status. Overlays are
// lazily generated i.e. pre-known assets that don't display by
// default will have an entry in this map, but the LayerMapValue will have a
// null overlay field until we do want to display it. Currently assume we're
// only working with one map.
const layerMap = {};
/** Values of layerMap. */
class LayerMapValue {
  /**
   * @param {google.maps.MapType} overlay - the actual layer (null if not created yet)
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
 * Main function that processes the known assets (FEMA damage, etc., SNAP) and
 * creates/populates the map and table.
 */
function run() {
  createAssetCheckboxes();
  initializeAssetLayers(map);
  const defaultPovertyThreshold = 0.3;
  // TODO(janakr): this number probably needs to be user-adjusted, based on
  // dataset.
  const processedData =
      processJoinedData(eeConstants.joinedSnap, eeConstants.scalingFactor, defaultPovertyThreshold);
  initializePriorityLayer(map, processedData);
  google.charts.setOnLoadCallback(
      () => drawTable(processedData, defaultPovertyThreshold));
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
      layerMap[assetName] = new LayerMapValue(null, index, false);
    }
  });
}

/**
 * Creates and displays overlay for priority + add layerMap entry. The priority
 * layer sits at the index of (# regular assets) i.e. the last index. Once we
 * add dynamically addable layers, it might be easier book keeping to have
 * priority sit at index 0, but having it last ensures it displays on top.
 *
 * @param {google.maps.Map} map main map
 * @param {FeatureCollection} layer the computed priority features
 */
function initializePriorityLayer(map, layer) {
  addLayer(
      map, layer.style({styleProperty: 'style'}), priorityLayerName,
      priorityIndex);
}
