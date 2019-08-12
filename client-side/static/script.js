import createMap from './create_map.js';
import drawTable from './draw_table.js';

export {geoidTag, priorityTag, snapTag, zero};
export {updatePriorityLayer as default};

// Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
// and returns the "overlay" that was added, in case the caller wants to add
// callbacks or similar to that overlay.
function addNewLayerFromId(map, layerId) {
  // create overlay
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map', layerId.mapid, layerId.token,
      {});
  // Show the EE map on the Google Map.
  const numLayers = map.overlayMapTypes.push(overlay);
  return overlay;
}

// Asynchronous wrapper for addLayerFromId that calls getMap() with a callback
// to avoid blocking on the result.
function createLayer(map, layer) {
  layer.getMap({
    callback: function (layerId, failure) {
      if (layerId) {
        return addNewLayerFromId(map, layerId);
      } else {
        // TODO: if there's an error, disable checkbox.
        createError('getting id')(failure);
      }
    }
  });
}

function createAssetLayers(map) {
  // This is the standard way to iterate over a dictionary according to
  // https://stackoverflow.com/questions/34448724/iterating-over-a-dictionary-in-javascript
  Object.keys(assets).forEach(function(assetName, index) {
    // TODO: generalize for ImageCollections (and Features/Images?)
    let overlay = createLayer(map, ee.FeatureCollection(assetName));
    layerMap[assetName] = new layerMapValue(overlay, index, assets[assetName]);
  });
}

function createPriorityLayer(map, layer) {
  let overlay = createLayer(map, layer);
  // If we ever allow dynamic addition of new assets, this may need to
  // change.
  layerMap[priorityLayerId] =
      new layerMapValue(overlay, Object.keys(assets).length - 1, true);
}


function removeLayer(map, layerName) {
  const layerMapValue = layerMap.get(layerName);
  if (typeof layerMapValue !== 'undefined' && layerMapValue.index !== -1) {
      map.overlayMapTypes.removeAt(layerMapValue.index);
      layerMapValue.index = -1;
  }
}

const damageLevels = ee.List(['NOD', 'UNK', 'AFF', 'MIN', 'MAJ', 'DES']);
// Initialized lazily, after ee.initialize() creates necessary function.
let damageScales = null;
const zero = ee.Number(0);
const priorityDisplayCap = ee.Number(99);
// TODO(janakr): this number probably needs to be user-adjusted, based on
// dataset.
const scalingFactor = ee.Number(100);
const geoidTag = 'GEOID';
const priorityTag = 'PRIORITY';
const snapTag = 'SNAP PERCENTAGE';

// Keep a map of asset name -> overlay, index, display status
// Currently assume we're only working with one map.
const layerMap = {};
const priorityLayerId = 'priority';

/**
 * Values of layerMap
 *
 * @constructor
 * @param {MapType} overlay - the actual layer
 * @param {int} index - position in list of assets (does not change)
 * @param {boolean} displayed - whether the layer is currently displayed
 */
function layerMapValue(overlay, index, displayed) {
  this.overlay = overlay;
  // index in map.overlayMapTypes (-1 if not displayed right now);
  this.index = index;
  this.displayed = displayed;
}

// Processes a feature corresponding to a geographic area and returns a new one,
// with just the GEOID and PRIORITY properties set, and a style attribute that
// sets the color/opacity based on the priority, with all priorities past 99
// equally opaque.
//
// povertyThreshold is used to filter out areas that are not poor enough (as
// determined by the areas SNAP and TOTAL properties).
//
// scalingFactor multiplies the raw priority, it can be adjusted to make sure
// that the values span the desired range of ~0 to ~100.
function colorAndRate(feature, scalingFactor, povertyThreshold) {
  const rawRatio = ee.Number(feature.get('SNAP')).divide(feature.get('TOTAL'));
  const priority =
      ee.Number(ee.Algorithms.If(
                    rawRatio.lte(povertyThreshold), zero,
                    ee.Number(damageLevels
                                  .map(function(type) {
                                    return ee.Number(damageScales.get(type))
                                        .multiply(feature.get(type));
                                  })
                                  .reduce(ee.Reducer.sum()))
                        .divide(feature.get('BUILDING_COUNT'))))
          .multiply(scalingFactor)
          .round();
  return ee
      .Feature(feature.geometry(), ee.Dictionary([
        geoidTag, feature.get(geoidTag), priorityTag, priority, snapTag,
        rawRatio
      ]))
      .set({
        style: {color: priority.min(priorityDisplayCap).format('ff00ff%02d')}
      });
}

function processJoinedData(joinedData, scale, povertyThreshold) {
  return joinedData.map(function(feature) {
    return colorAndRate(feature, scale, povertyThreshold);
  });
}

// The base Google Map, Initialized lazily to ensure doc is ready
let map = null;
const joinedSnap = ee.FeatureCollection('users/janak/texas-snap-join-damage-with-buildings');

// Removes the current score overlay on the map (if there is one).
// Reprocesses scores with new povertyThreshold , overlays new score layer
// and redraws table .
function updatePriorityLayer(povertyThreshold) {
  const processedData =
      processJoinedData(joinedSnap, scalingFactor, povertyThreshold);
  layerMap[priorityLayerId].overlay = createLayer(map, processedData);
  google.charts.setOnLoadCallback(
      () => drawTable(processedData, povertyThreshold));
}

// Dictionary of known assets -> whether they should be displayed by default
const assets = {'users/janak/FEMA_Damage_Assessments_Harvey_20170829': true};

// Main function that processes the data (FEMA damage, SNAP) and
// creates/populates the map and table with a new poverty threshold.
function run() {
  damageScales = ee.Dictionary.fromLists(damageLevels, [0, 0, 1, 1, 2, 3]);
  const defaultPovertyThreshold = 0.3;

  createAssetCheckboxes();
  createAssetLayers(map);
  const processedData =
      processJoinedData(joinedSnap, scalingFactor, defaultPovertyThreshold);
  createPriorityLayer(map, processedData);
}

function createAssetCheckboxes() {
  // TODO: these probably shouldn't just sit at the bottom of the page - move to
  // a better place.
  // TODO: add events on click.
  Object.keys(assets).forEach(assetName => createNewCheckbox(assetName));
  createNewCheckbox('priority');
}

function createNewCheckbox(assetName) {
  let newBox = document.createElement('input');
  newBox.type = 'checkbox';
  newBox.id = assetName;
  document.body.appendChild(newBox);
  let label = document.createElement('label');
  label.for = assetName;
  label.innerHTML = assetName;
  document.body.appendChild(label);
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, Google Map is initialized, and on successful
// login, EE data is overlayed.
// TODO(janakr): authentication seems buggy, investigate.
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  const CLIENT_ID =
      '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';
  // TODO(#13): This is from juliexxia's console. Should use one for
  // GiveDirectly. Also, this client id has not been properly configured yet.
  // const CLIENT_ID =
  // '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';

  google.charts.load('current', {packages: ['table', 'controls']});

  $(document).ready(function() {
    map = createMap();

    const runOnSuccess = function() {
      ee.initialize(
          /*opt_baseurl=*/ null, /*opt_tileurl=*/ null,
          () => run(), createError('initializing EE'));
    };

    // Shows a button prompting the user to log in.
    const onImmediateFailed = function() {
      $('.g-sign-in').removeClass('hidden');
      $('.output').text('(Log in to see the result.)');
      $('.g-sign-in .button').click(function() {
        ee.data.authenticateViaPopup(function() {
          // If the login succeeds, hide the login button and run the analysis.
          $('.g-sign-in').addClass('hidden');
          runOnSuccess();
        });
      });
    };

    // Attempt to authenticate using existing credentials.
    // TODO(#21): Fix buggy authentification.
    // ee.data.authenticate(
    //     CLIENT_ID,
    //     runOnSuccess,
    //     createError('authenticating'),
    //     null,
    //     onImmediateFailed);
    runOnSuccess();
  });
};

// TODO(janakr): use some standard error library?
function createError(message) {
  return function(error) {
    console.error('Error ' + message + ': ' + error);
  }
}

setup();
