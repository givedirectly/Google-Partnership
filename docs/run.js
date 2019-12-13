import {clickFeature, selectHighlightedFeatures} from './click_feature.js';
import {sidebarDatasetsId, tableContainerId} from './dom_constants.js';
import {drawTable} from './draw_table.js';
import {addLayer, addNullLayer, addScoreLayer, scoreLayerName, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from './layer_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {convertEeObjectToPromise} from './map_util.js';
import {initializeAndProcessUserRegions} from './polygon_draw.js';
import {setUserFeatureVisibility} from './popup.js';
import processJoinedData from './process_joined_data.js';
import {getScoreAsset} from './resources.js';
import {setUpToggles} from './update.js';

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
  const scoreAsset = getScoreAsset();
  snapAndDamagePromise =
      convertEeObjectToPromise(ee.FeatureCollection(scoreAsset));
  const initialTogglesValuesPromise =
      setUpToggles(disasterMetadataPromise, map);
  createAndDisplayJoinedData(map, initialTogglesValuesPromise, scoreAsset);
  initializeAndProcessUserRegions(map, disasterMetadataPromise);
  disasterMetadataPromise.then((doc) => addLayers(map, doc.data().layers));
}

let mapSelectListener = null;
let featureSelectListener = null;

/**
 * Creates the score overlay and draws the table
 *
 * @param {google.maps.Map} map main map
 * @param {Promise<Array<number>>} initialTogglesValuesPromise promise
 * that returns the poverty and damage thresholds and the poverty weight (from
 * which the damage weight is derived).
 * @param {string} scoreAsset
 */
function createAndDisplayJoinedData(
    map, initialTogglesValuesPromise, scoreAsset) {
  addLoadingElement(tableContainerId);
  // clear old listeners
  google.maps.event.removeListener(mapSelectListener);
  google.maps.event.removeListener(featureSelectListener);
  const processedData = processJoinedData(
      snapAndDamagePromise, scalingFactor, initialTogglesValuesPromise);
  addScoreLayer(processedData);
  maybeCheckScoreCheckbox();
  drawTableAndSetUpHandlers(processedData, map, scoreAsset);
}

/**
 * Invokes {@link drawTable} with the appropriate callbacks to set up click
 * handlers for the map.
 * @param {Promise<Array<GeoJson.Feature>>} processedData
 * @param {google.maps.Map} map
 * @param {string} scoreAsset EE path to score asset FeatureCollection
 */
function drawTableAndSetUpHandlers(processedData, map, scoreAsset) {
  drawTable(processedData, map).then((tableSelector) => {
    loadingElementFinished(tableContainerId);
    // every time we get a new table and data, reselect elements in the
    // table based on {@code currentFeatures} in highlight_features.js.
    selectHighlightedFeatures(tableSelector);
    // TODO: handle ctrl+click situations
    const clickFeatureHandler = (event) => clickFeature(
        event.latLng.lng(), event.latLng.lat(), map, scoreAsset, tableSelector);
    mapSelectListener = map.addListener('click', clickFeatureHandler);
    // map.data covers clicks to map areas underneath map.data so we need
    // two listeners
    featureSelectListener = map.data.addListener('click', clickFeatureHandler);
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
 * Gets the linear gradient of the colors for the legend.
 *
 * @param {Object} colorFunction color data from the layer
 * @return {string} the linear gradient
 */
function getLinearGradient(colorFunction) {
  if (!colorFunction) {
    return '';
  }
  const colors = [];
  const currentStyle = colorFunction['current-style'];
  switch (currentStyle) {
    case 0:
      colors.push('white', colorFunction['color']);
      break;
    case 1:
      colors.push(...(new Set(Object.values(colorFunction['colors']))));
      break;
    case 2:
      colors.push(colorFunction['color'], colorFunction['color']);
      break;
  }

  let gradientString = 'linear-gradient(to right';
  for (const c of colors) {
    gradientString += ', ' + c;
  }
  return gradientString + ')';
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
  if (!layer['display-on-load']) {
    newBox.checked = false;
  }
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
 * @param {Element} checkgox
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
      {color: '#4CEF64', 'current-style': 2});
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
        'color-function': {color: 'pink', 'current-style': 0},
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
