import {clickFeature, selectHighlightedFeatures} from './click_feature.js';
import {sidebarDatasetsId, tableContainerId} from './dom_constants.js';
import {drawTable} from './draw_table.js';
import {assets} from './earth_engine_asset.js';
import {firebaseAssets, initializeFirebaseAssets} from './firebase_assets.js';
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
const scoreIndex = Object.keys(assets).length;

/**
 * Main function that processes the known assets (FEMA damage, etc., SNAP) and
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
        initializeFirebaseAssets(doc.data());
        initializeAssetLayers(map);
      });
  createNewCheckboxForAsset(
      scoreLayerName, document.getElementById(sidebarDatasetsId), map);
  createAndDisplayJoinedData(
      map, initialPovertyThreshold, initialDamageThreshold,
      initialPovertyWeight);
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
 * Creates checkboxes for all known assets, user features, and the score
 * overlay.
 *
 * @param {google.maps.Map} map main map
 */
function createAssetCheckboxes(map) {
  const sidebarDiv = document.getElementById(sidebarDatasetsId);
  Object.keys(assets).forEach(
      (assetName) => createNewCheckboxForAsset(assetName, sidebarDiv, map));
  Object.keys(firebaseAssets)
      .forEach(
          (assetName) =>
              createNewCheckboxForFirebaseAsset(assetName, sidebarDiv, map));
  createCheckboxForUserFeatures(sidebarDiv);
}

/**
 * Creates a checkbox for showing/hiding layers.
 *
 * @param {String} name checkbox name, basis for id
 * @param {String} displayName checkbox display name
 * @param {div} parentDiv div to attach checkbox to
 * @param {google.maps.Map} map main map
 * @return {HTMLInputElement} the checkbox
 */
function createNewCheckbox(name, displayName, parentDiv, map) {
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
 * Creates a new checkbox for the given firebase asset.
 *
 * @param {String} assetName 'users/gd/...'
 * @param {Element} parentDiv
 * @param {google.maps.Map} map main map
 */
function createNewCheckboxForFirebaseAsset(assetName, parentDiv, map) {
  const newBox = createNewCheckbox(
      assetName,
      firebaseAssets[assetName] ? firebaseAssets[assetName]['display-name'] :
                                  assetName,
      parentDiv);
  if (firebaseAssets[assetName] &&
      !firebaseAssets[assetName]['display-on-load']) {
    newBox.checked = false;
  }
  setBoxOnclick(newBox, assetName, map);
}

/**
 * Creates a new checkbox for the given asset.
 *
 * @param {String} assetName
 * @param {Element} parentDiv
 * @param {google.maps.Map} map main map
 */
function createNewCheckboxForAsset(assetName, parentDiv, map) {
  // TODO: remove this function in follow up CL when all assets info is stored
  // in firebase
  const newBox = createNewCheckbox(
      assetName,
      assets[assetName] ? assets[assetName].getDisplayName() : assetName,
      parentDiv);
  if (assets[assetName] && !assets[assetName].shouldDisplayOnLoad()) {
    newBox.checked = false;
  }
  setBoxOnclick(newBox, assetName, map);
}

/**
 * Temporary helper fxn while we have two different createNewCheckbox fxns.
 * @param {HTMLElement} box
 * @param {String} assetName
 * @param {google.maps.Map} map main map
 */
function setBoxOnclick(box, assetName, map) {
  box.onclick = () => {
    if (box.checked) {
      toggleLayerOn(assetName, map);
    } else {
      toggleLayerOff(assetName, map);
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
 * Runs through asset map. For those that we auto-display on page load, creates
 * overlays and displays. Also populates the layerMap.
 *
 * @param {google.maps.Map} map main map
 */
function initializeAssetLayers(map) {
  // TODO: remove when we store all assets in firestore
  Object.keys(assets).forEach((assetName, index) => {
    if (assets[assetName].shouldDisplayOnLoad()) {
      addLayer(assetName, index, map);
    } else {
      addNullLayer(assetName, index);
    }
  });
  Object.keys(firebaseAssets).forEach((asset, index) => {
    const properties = firebaseAssets[asset];
    if (properties['display-on-load']) {
      addLayer(asset, index, map);
    } else {
      // TODO: index still relevent? just alphabetical. probably want to
      // store index at some point.
      addNullLayer(asset, index);
    }
  });
  createAssetCheckboxes(map);
}

/**
 * Creates and displays overlay for score + adds layerMap entry. The score
 * layer sits at the index of (# regular assets) i.e. the last index. Once we
 * add dynamically addable layers, it might be easier book keeping to have
 * score sit at index 0, but having it last ensures it displays on top.
 *
 * @param {google.maps.Map} map main map
 * @param {Promise<Array<GeoJson>>} layer
 */
function initializeScoreLayer(map, layer) {
  addLayerFromGeoJsonPromise(layer, scoreLayerName, scoreIndex);
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
