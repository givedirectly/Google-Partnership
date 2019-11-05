import {clickFeature, selectHighlightedFeatures} from './click_feature.js';
import {sidebarDatasetsId, tableContainerId} from './dom_constants.js';
import {drawTable} from './draw_table.js';
import {firebaseLayers, initializeFirebaseLayers} from './firebase_layers.js';
import {highlightFeatures} from './highlight_features.js';
import {addLayer, addLayerFromGeoJsonPromise, addNullLayer, scoreLayerName, setMapToDrawLayersOn, toggleLayerOff, toggleLayerOn} from './layer_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {convertEeObjectToPromise} from './map_util.js';
import {processUserRegions} from './polygon_draw.js';
import {setUserFeatureVisibility} from './popup.js';
import processJoinedData from './process_joined_data.js';
import {getDisaster, getResources} from './resources.js';
import {createToggles, initialDamageThreshold, initialPovertyThreshold, initialPovertyWeight} from './update.js';

export {
  createAndDisplayJoinedData,
  run as default,
};

const snapAndDamageAsset = 'users/gd/' + getDisaster() + '/data-ms-as-nod';
// Promise for snapAndDamageAsset. After it's first resolved, we never need to
// download it from EarthEngine again.
let snapAndDamagePromise;
const scalingFactor = 100;

/**
 * Main function that processes the known layers (damage, SNAP) and
 * creates/populates the map and table.
 *
 * @param {google.maps.Map} map main map
 * @param {Promise<any>} firebasePromise Promise that will complete when
 *     Firebase authentication is finished
 */
function run(map, firebasePromise) {
  setMapToDrawLayersOn(map);
  createToggles(map);
  snapAndDamagePromise =
      convertEeObjectToPromise(ee.FeatureCollection(snapAndDamageAsset));
  processUserRegions(map, firebasePromise);
  firebasePromise
      .then(
          () => firebase.firestore()
                    .collection('disaster-metadata')
                    .doc(getResources().year)
                    .collection(getDisaster())
                    .doc('layers')
                    .get())
      .then((doc) => {
        const data = doc.data();
        initializeFirebaseLayers(data);
        addLayers(map);
        createAndDisplayJoinedData(
            map, initialPovertyThreshold, initialDamageThreshold,
            initialPovertyWeight, Object.keys(data).length);
      });
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
 * @param {number} numLayers number of layers stored in firebase for this
 *     disaster.
 */
function createAndDisplayJoinedData(
    map, povertyThreshold, damageThreshold, povertyWeight, numLayers) {
  addLoadingElement(tableContainerId);
  // clear old listeners
  google.maps.event.removeListener(mapSelectListener);
  google.maps.event.removeListener(featureSelectListener);
  const processedData = processJoinedData(
      snapAndDamagePromise, scalingFactor, povertyThreshold, damageThreshold,
      povertyWeight);
  addScoreLayer(processedData, numLayers);
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
 * Creates checkboxes for all known layers (including user features and score).
 *
 * @param {google.maps.Map} map main map
 */
function createLayerCheckboxes(map) {
  const sidebarDiv = document.getElementById(sidebarDatasetsId);
  Object.keys(firebaseLayers)
      .forEach(
          (layerName) => createNewCheckboxForLayer(layerName, sidebarDiv, map));
  createCheckboxForUserFeatures(sidebarDiv);
  // score checkbox gets checked during addScoreLayer
  createNewCheckboxForLayer(scoreLayerName, sidebarDiv, map);
}

/**
 * Creates a checkbox for showing/hiding layers.
 *
 * @param {String} name checkbox name, basis for id
 * @param {String} displayName checkbox display name
 * @param {div} parentDiv div to attach checkbox to
 * @return {HTMLInputElement} the checkbox
 */
function createNewCheckbox(name, displayName, parentDiv) {
  const newRow = document.createElement('div');
  newRow.className = 'checkbox-row';
  const newBox = document.createElement('input');
  newBox.type = 'checkbox';
  newBox.id = getCheckBoxId(name);
  newBox.className = 'checkbox';
  newBox.checked = true;
  newRow.appendChild(newBox);
  const newMark = document.createElement('span');
  newMark.className = 'checkmark';
  newRow.appendChild(newMark);
  const label = document.createElement('label');
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
 * @param {String} layerName
 * @param {Element} parentDiv
 * @param {google.maps.Map} map main map
 */
function createNewCheckboxForLayer(layerName, parentDiv, map) {
  const properties = firebaseLayers[layerName];
  const newBox = createNewCheckbox(
      layerName, properties ? properties['display-name'] : layerName,
      parentDiv);
  if (properties && !properties['display-on-load']) {
    newBox.checked = false;
  }
  newBox.onclick = () => {
    if (newBox.checked) {
      toggleLayerOn(layerName, map);
    } else {
      toggleLayerOff(layerName, map);
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
 * Runs through layers map. For those that we auto-display on page load, creates
 * overlays and displays. Also populates the layerMap.
 *
 * @param {google.maps.Map} map main map
 */
function addLayers(map) {
  // TODO: right now layers are automatically indexed (and therefore ordered)
  // alphabetically (except for the score layer which is always on top). Maybe
  // allow for way to rearrange layers.
  Object.keys(firebaseLayers).forEach((layer, index) => {
    const properties = firebaseLayers[layer];
    if (properties['display-on-load']) {
      addLayer(layer, index, map);
    } else {
      addNullLayer(layer, index);
    }
  });
  createLayerCheckboxes(map);
}

/**
 * Creates and displays overlay for score + adds layerMap entry. The score
 * layer sits at the index of (# regular layers) i.e. the last index. Once we
 * add dynamically addable layers, it might be easier book keeping to have
 * score sit at index 0, but having it last ensures it displays on top.
 *
 * @param {Promise<Array<GeoJson>>} layer
 * @param {number} numLayers number of layers stored in firebase for this
 *     disaster.
 */
function addScoreLayer(layer, numLayers) {
  addLayerFromGeoJsonPromise(layer, scoreLayerName, numLayers);
  document.getElementById(getCheckBoxId(scoreLayerName)).checked = true;
}

/**
 * Creates the id of a show/hide checkbox.
 *
 * @param {string} baseName
 * @return {string}
 */
function getCheckBoxId(baseName) {
  return baseName + '-checkbox';
}
