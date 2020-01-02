import {getCheckBoxId, getCheckBoxRowId} from './checkbox_util.js';
import {clickFeature, selectHighlightedFeatures} from './click_feature.js';
import {sidebarDatasetsId, tableContainerId} from './dom_constants.js';
import {drawTable} from './draw_table.js';
import {AssetNotFoundError, getEePromiseForFeatureCollection} from './ee_promise_cache.js';
import {showError} from './error.js';
import {getLinearGradient} from './import/color_function_util.js';
import {addLayer, addNullLayer, addScoreLayer, scoreLayerName, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from './layer_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {initializeAndProcessUserRegions} from './polygon_draw.js';
import {setUserFeatureVisibility} from './popup.js';
import {processJoinedData} from './process_joined_data.js';
import {getBackupScoreAssetPath, getScoreAssetPath} from './resources.js';
import {setUpToggles} from './update.js';

export {createAndDisplayJoinedData, run};
// For testing.
export {drawTableAndSetUpHandlers, resolveScoreAsset};

const scalingFactor = 100;

/**
 * Contains name of score asset. This is not just {@link getScoreAssetPath}
 * because in the case that the asset with id {@link getScoreAssetPath} does not
 * exist, we will fall back to the asset with id
 * {@link getBackupScoreAssetPath}. Only assigned once, except in tests.
 * @type {Promise<string>}
 */
let resolvedScoreAsset;

/**
 * Seeds {@link Promise} cache with `eeAsset`, and returns {@link Promise} whose
 * value is `eeAsset`. Caller can then wait on returned {@link Promise} to see
 * if `eeAsset` is valid asset.
 * @param {string} eeAsset
 * @return {Promise<string>} {@link Promise} with `eeAsset` once {@link
 *     ee.FeatureCollection} with path `eeAsset` has been downloaded
 */
function createPromiseWithPathIfSuccessful(eeAsset) {
  return getEePromiseForFeatureCollection(eeAsset).then(() => eeAsset);
}

/**
 * Sets {@link resolvedScoreAsset} to {@link getScoreAssetPath}, or, if that
 * does not exist as an EarthEngine asset, to {@link getBackupScoreAssetPath}.
 * The returned {@link Promise} throws if neither exists.
 *
 * @return {Promise<string>} Promise with the name of the score asset found,
 *     only needed by tests.
 */
function resolveScoreAsset() {
  resolvedScoreAsset =
      createPromiseWithPathIfSuccessful(getScoreAssetPath()).catch((err) => {
        if (err instanceof AssetNotFoundError) {
          showError(
              'Primary score asset not found. Checking to see if ' +
                  'backup exists',
              null);
          return createPromiseWithPathIfSuccessful(getBackupScoreAssetPath());
        } else {
          throw err;
        }
      });
  return resolvedScoreAsset;
}

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
  resolveScoreAsset();
  const initialTogglesValuesPromise =
      setUpToggles(disasterMetadataPromise, map);
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
 * @param {Promise<Array<number>>} initialTogglesValuesPromise promise that
 *     returns the poverty and damage thresholds and the poverty weight (from
 *     which the damage weight is derived).
 */
function createAndDisplayJoinedData(map, initialTogglesValuesPromise) {
  addLoadingElement(tableContainerId);
  // clear old listeners
  google.maps.event.removeListener(mapSelectListener);
  google.maps.event.removeListener(featureSelectListener);
  const processedData = processJoinedData(
      resolvedScoreAsset.then(getEePromiseForFeatureCollection), scalingFactor,
      initialTogglesValuesPromise);
  addScoreLayer(processedData.then(({featuresList}) => featuresList));
  maybeCheckScoreCheckbox();
  drawTableAndSetUpHandlers(processedData, map);
}

/**
 * Invokes {@link drawTable} with the appropriate callbacks to set up click
 * handlers for the map.
 * @param {Promise<Array<GeoJsonFeature>>} processedData
 * @param {google.maps.Map} map
 */
function drawTableAndSetUpHandlers(processedData, map) {
  Promise.all([resolvedScoreAsset, drawTable(processedData, map)])
      .then(([scoreAsset, tableSelector]) => {
        loadingElementFinished(tableContainerId);
        // every time we get a new table and data, reselect elements in the
        // table based on {@code currentFeatures} in highlight_features.js.
        selectHighlightedFeatures(tableSelector);
        // TODO: handle ctrl+click situations
        const clickFeatureHandler = (event) => clickFeature(
            event.latLng.lng(), event.latLng.lat(), map, scoreAsset,
            tableSelector);
        mapSelectListener = map.addListener('click', clickFeatureHandler);
        // map.data covers clicks to map areas underneath map.data so we need
        // two listeners
        featureSelectListener =
            map.data.addListener('click', clickFeatureHandler);
      });
}

/**
 * Creates a checkbox for showing/hiding layers.
 *
 * @param {number|string} index checkbox index, basis for id
 * @param {String} displayName checkbox display name
 * @param {div} parentDiv div to attach checkbox to
 * @param {Object} colorFunction color data from the layer
 * @return {HTMLInputElement} the checkbox
 */
function createNewCheckbox(index, displayName, parentDiv) {
  const newRow = document.createElement('div');
  newRow.className = 'checkbox-row';
  newRow.id = getCheckBoxRowId(index);

  // TODO: add additional information on mouseover.
  const newBox = document.createElement('input');
  newBox.type = 'checkbox';
  newBox.id = getCheckBoxId(index);
  newBox.className = 'checkbox layer-checkbox';
  newBox.checked = true;
  newRow.appendChild(newBox);

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
  const linearGradient = getLinearGradient(layer['color-function']);
  newBox.checked = !!layer['display-on-load'];
  updateCheckboxBackground(newBox, linearGradient);

  newBox.onclick = () => {
    updateCheckboxBackground(newBox, linearGradient);
    if (newBox.checked) {
      toggleLayerOn(layer, map);
    } else {
      toggleLayerOff(index, map);
    }
  };
}

/**
 * Sets the checkbox background with a linear gradient to help users identify
 * layers.
 *
 * @param {Element} checkbox
 * @param {string} gradient the linear gradient for the checkbox background
 */
function updateCheckboxBackground(checkbox, gradient) {
  if (checkbox.checked) {
    if (gradient) {
      checkbox.style.backgroundImage = gradient;
    }
  } else {
    if (gradient) {
      checkbox.style.backgroundImage = '';
    }
  }
}

/**
 * Creates a show/hide checkbox for user features.
 *
 * @param {div} parentDiv div to attach checkbox to
 */
function createCheckboxForUserFeatures(parentDiv) {
  const newBox = createNewCheckbox(
      'user-features', 'user features', parentDiv,
      {'color': '#4CEF64', 'current-style': 2});
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
        'color-function': {'color': '#ff00ff', 'current-style': 0},
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
