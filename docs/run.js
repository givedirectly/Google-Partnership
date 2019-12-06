import {clickFeature, selectHighlightedFeatures} from './click_feature.js';
import {sidebarDatasetsId, tableContainerId} from './dom_constants.js';
import {drawTable} from './draw_table.js';
import {highlightFeatures} from './highlight_features.js';
import {addLayer, addNullLayer, addScoreLayer, scoreLayerName, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from './layer_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {convertEeObjectToPromise} from './map_util.js';
import {initializeAndProcessUserRegions} from './polygon_draw.js';
import {setUserFeatureVisibility} from './popup.js';
import processJoinedData from './process_joined_data.js';
import {getScoreAsset} from './resources.js';
import {createToggles, initialDamageThreshold, initialPovertyThreshold, initialPovertyWeight} from './update.js';

export {
  createAndDisplayJoinedData,
drawTableAndSetUpHandlers,
  run as default,
};

// Promise for score asset. After it's first resolved, we never need to download
// it from EarthEngine again.
let snapAndDamagePromise;
const scalingFactor = 100;

/**
 * Main function that processes the known layers (damage, SNAP) and
 * creates/populates the map and table.
 *
 * @param {google.maps.Map} map main map
 * @param {Promise<any>} firebaseAuthPromise Promise that will complete when
 *     Firebase authentication is finished
 * @param {Promise<firebase.firestore.DocumentSnapshot>} disasterMetadataPromise
 *     Promise with disaster metadata for this disaster
 */
function run(map, firebaseAuthPromise, disasterMetadataPromise) {
  setMapToDrawLayersOn(map);
  createToggles(map);
  const scoreAsset = getScoreAsset();
  snapAndDamagePromise =
      convertEeObjectToPromise(ee.FeatureCollection(scoreAsset));
  createAndDisplayJoinedData(
      map, initialPovertyThreshold, initialDamageThreshold,
      initialPovertyWeight, scoreAsset);
  initializeAndProcessUserRegions(map, disasterMetadataPromise);
  disasterMetadataPromise.then((doc) => addLayers(map, doc.data().layers));
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
 * @param {ee.FeatureCollection} scoreAsset
 */
function createAndDisplayJoinedData(
    map, povertyThreshold, damageThreshold, povertyWeight, scoreAsset) {
  addLoadingElement(tableContainerId);
  // clear old listeners
  google.maps.event.removeListener(mapSelectListener);
  google.maps.event.removeListener(featureSelectListener);
  const processedData = processJoinedData(
      snapAndDamagePromise, scalingFactor, povertyThreshold, damageThreshold,
      povertyWeight);
  addScoreLayer(processedData);
  maybeCheckScoreCheckbox();
  drawTableAndSetUpHandlers(processedData, map, scoreAsset);
}

function drawTableAndSetUpHandlers(processedData, map, scoreAsset) {
  drawTable(
      processedData, (features) => highlightFeatures(features, map, true),
      (tableSelector) => {
        loadingElementFinished(tableContainerId);
        // every time we get a new table and data, reselect elements in the
        // table based on {@code currentFeatures} in highlight_features.js.
        selectHighlightedFeatures(tableSelector);
        addClickFeatureListener(map, tableSelector, scoreAsset);
      });
}

/**
 * Adds listener to map so that we can pop up info box for a feature that's
 * clicked on.
 * @param {google.maps.Map} map
 * @param {Function} tableSelector Selects table rows with specified geoids
 * @param {ee.FeatureCollection} scoreAsset
 */
function addClickFeatureListener(map, tableSelector, scoreAsset) {
  // TODO: handle ctrl+click situations
  mapSelectListener = map.addListener('click', (event) => {
    clickFeature(
        event.latLng.lng(), event.latLng.lat(), map, scoreAsset,
        tableSelector);
  });
  // map.data covers clicks to map areas underneath map.data so we need
  // two listeners
  featureSelectListener = map.data.addListener('click', (event) => {
    clickFeature(
        event.latLng.lng(), event.latLng.lat(), map, scoreAsset,
        tableSelector);
  });
}

/**
 * Creates a checkbox for showing/hiding layers.
 *
 * @param {number|string} index checkbox index, basis for id
 * @param {String} displayName checkbox display name
 * @param {div} parentDiv div to attach checkbox to
 * @return {HTMLInputElement} the checkbox
 */
function createNewCheckbox(index, displayName, parentDiv) {
  const newRow = document.createElement('div');
  newRow.className = 'checkbox-row';
  const newBox = document.createElement('input');
  newBox.type = 'checkbox';
  newBox.id = getCheckBoxId(index);
  newBox.className = 'checkbox';
  newBox.checked = true;
  newRow.appendChild(newBox);
  const newMark = document.createElement('span');
  newMark.className = 'checkmark';
  newRow.appendChild(newMark);
  const label = document.createElement('label');
  label.className = 'checkbox-label';
  label.htmlFor = newBox.id;
  label.innerHTML = displayName;
  newRow.appendChild(label);
  parentDiv.appendChild(newRow);
  return newBox;
}

/**
 * Creates a new checkbox for the given layer. The only layer not recorded in
 * firebase should be the score layer.
 *
 * @param {Object} layer Data for layer coming from Firestore
 * @param {Element} parentDiv
 * @param {google.maps.Map} map main map
 */
function createNewCheckboxForLayer(layer, parentDiv, map) {
  const index = layer['index'];
  const newBox = createNewCheckbox(index, layer['display-name'], parentDiv);
  if (!layer['display-on-load']) {
    newBox.checked = false;
  }
  newBox.onclick = () => {
    if (newBox.checked) {
      toggleLayerOn(layer, map);
    } else {
      toggleLayerOff(index, map);
    }
  };
}

/**
 * Creates a show/hide checkbox for user features.
 *
 * @param {div} parentDiv div to attach checkbox to
 */
function createCheckboxForUserFeatures(parentDiv) {
  const newBox = createNewCheckbox('user-features', 'user features', parentDiv);
  newBox.checked = true;
  newBox.onclick = () => setUserFeatureVisibility(newBox.checked);
}

/**
 * Runs through layers list. For those that we auto-display on page load,
 * creates overlays and displays. Also creates checkboxes.
 *
 * @param {google.maps.Map} map main map
 * @param {Array<Object>} firebaseLayers layer metadata retrieved from
 *     Firestore, ordered by the order they should be drawn on the map (higher
 *     indices are displayed over lower ones)
 */
function addLayers(map, firebaseLayers) {
  const sidebarDiv = document.getElementById(sidebarDatasetsId);
  for (let i = 0; i < firebaseLayers.length; i++) {
    const properties = firebaseLayers[i];
    properties['index'] = i;
    if (properties['display-on-load']) {
      addLayer(properties, map);
    } else {
      addNullLayer(properties);
    }
    createNewCheckboxForLayer(properties, sidebarDiv, map);
  }
  createCheckboxForUserFeatures(sidebarDiv);
  createNewCheckboxForLayer(
      {
        'display-name': scoreLayerName,
        'index': scoreLayerName,
        'display-on-load': true,
      },
      sidebarDiv, map);
}

/**
 * Checkbox may not exist yet if layer metadata not retrieved yet. The checkbox
 * creation will check the box by default. This manually checks it in case it
 * was unchecked by the user, and this is coming from a weight/threshold update.
 */
function maybeCheckScoreCheckbox() {
  const checkbox = document.getElementById(getCheckBoxId(scoreLayerName));
  if (checkbox) {
    checkbox.checked = true;
  }
}

/**
 * Creates the id of a show/hide checkbox.
 *
 * @param {string} baseName
 * @return {string}
 */
function getCheckBoxId(baseName) {
  return 'layer-' + baseName + '-checkbox';
}
