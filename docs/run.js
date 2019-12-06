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
import {createToggles, setUpInitialToggleValues} from './update.js';

export {
  createAndDisplayJoinedData,
  run as default,
};

const snapAndDamageAsset = getScoreAsset();
// Promise for snapAndDamageAsset. After it's first resolved, we never need to
// download it from EarthEngine again.
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
  snapAndDamagePromise =
      convertEeObjectToPromise(ee.FeatureCollection(snapAndDamageAsset));
  const initialTogglesValuesPromise =
      setUpInitialToggleValues(disasterMetadataPromise);
  initialTogglesValuesPromise.then(() => createToggles(map));
  createAndDisplayJoinedData(map, initialTogglesValuesPromise);
  initializeAndProcessUserRegions(map, disasterMetadataPromise);
  disasterMetadataPromise.then((doc) => addLayers(map, doc.data().layers));
}

let mapSelectListener = null;
let featureSelectListener = null;

/**
 * Creates the score overlay and draws the table
 *
 * @param {google.maps.Map} map main map
 * @param {Promise<Map<string, number>>} initialTogglesValuesPromise promise
 * that returns the poverty and damage thresholds and the poverty weight (from
 * which the damage weight is derived).
 */
function createAndDisplayJoinedData(map, initialTogglesValuesPromise) {
  addLoadingElement(tableContainerId);
  // clear old listeners
  google.maps.event.removeListener(mapSelectListener);
  google.maps.event.removeListener(featureSelectListener);
  // TODO: doesn't this return a promise?
  const processedData = processJoinedData(
      snapAndDamagePromise, scalingFactor, initialTogglesValuesPromise);
  addScoreLayer(processedData);
  maybeCheckScoreCheckbox();
  drawTable(
      processedData, (features) => highlightFeatures(features, map, true),
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
