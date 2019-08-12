import createMap from './create_map.js';
import drawTable from './draw_table.js';

export {geoidTag, priorityTag, snapTag, zero};
export {updatePovertyThreshold as default};

/**
 * Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
 * and returns the "overlay" that was added, in case the caller wants to add
 * callbacks or similar to that overlay.
 *
 * @param {ee.Element} map
 * @param {Object} layerId
 * @param {string} layerName
 * @return {ee.MapLayerOverlay}
 */
function addLayerFromId(map, layerId, layerName) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map', layerId.mapid, layerId.token,
      {});
  // Show the EE map on the Google Map.
  const numLayers = map.overlayMapTypes.push(overlay);
  layerIndexMap.set(layerName, numLayers - 1);
  return overlay;
}

/**
 * Asynchronous wrapper for addLayerFromId that calls getMap() with a callback
 * to avoid blocking on the result.
 *
 * @param {google.maps.Map} map
 * @param {ee.Element} layer
 * @param {string} layerName
 */
function addLayer(map, layer, layerName) {
  layer.getMap({
    callback: function(layerId, failure) {
      if (layerId) {
        addLayerFromId(map, layerId, layerName);
      } else {
        createError('getting id')(failure);
      }
    },
  });
}

/**
 * Remove layerName from the map.
 *
 * @param {google.maps.Map} map
 * @param {string} layerName
 */
function removeLayer(map, layerName) {
  const index = layerIndexMap.get(layerName);
  if (typeof index !== 'undefined') {
    map.overlayMapTypes.removeAt(index);
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

// Keep a map of layer name to array position in overlayMapTypes for easy
// removal
const layerIndexMap = new Map();
const priorityLayerName = 'priority';
const femaDamageLayerId = 'fema';

/**
 * Processes a feature corresponding to a geographic area and returns a new one,
 * with just the GEOID and PRIORITY properties set, and a style attribute that
 * sets the color/opacity based on the priority, with all priorities past 99
 * equally opaque.
 *
 * @param {ee.Feature} feature
 * @param {ee.Number} scalingFactor multiplies the raw priority, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 * ~100.
 * @param {number} povertyThreshold  used to filter out areas that are not poor
 *     enough (as determined by the areas SNAP and TOTAL properties).
 *
 * @return {ee.Feature}
 */
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
        geoidTag,
        feature.get(geoidTag),
        priorityTag,
        priority,
        snapTag,
        rawRatio,
      ]))
      .set({
        style: {color: priority.min(priorityDisplayCap).format('ff00ff%02d')},
      });
}

/**
 * @param {ee.FeatureCollection} joinedData
 * @param {ee.Number} scale
 * @param {number} povertyThreshold
 * @return {ee.FeatureCollection}
 */
function processJoinedData(joinedData, scale, povertyThreshold) {
  return joinedData.map(function(feature) {
    return colorAndRate(feature, scale, povertyThreshold);
  });
}

// The base Google Map, Initialized lazily to ensure doc is ready
let map = null;
const joinedSnap =
    ee.FeatureCollection('users/janak/texas-snap-join-damage-with-buildings');

/**
 * Removes the current score overlay on the map (if there is one).
 * Reprocesses scores with new povertyThreshold, overlays new score layer
 * and redraws table.
 *
 * @param {number}povertyThreshold
 */
function updatePovertyThreshold(povertyThreshold) {
  removeLayer(map, priorityLayerName);

  const processedData =
      processJoinedData(joinedSnap, scalingFactor, povertyThreshold);
  addLayer(map, processedData.style({styleProperty: 'style'}), priorityLayerName);
  drawTable(processedData);
}

// Dictionary of known assets -> whether they should be displayed by default
// TODO(juliexxia): don't initially display assets that have false values here.
const assets = {'users/janak/FEMA_Damage_Assessments_Harvey_20170829': true};

/**
 * Main function that processes the data (FEMA damage, SNAP) and
 * creates/populates the map and table with a new poverty threshold.
 *
 * @param {number} povertyThreshold
 */
function run(povertyThreshold) {
  damageScales = ee.Dictionary.fromLists(damageLevels, [0, 0, 1, 1, 2, 3]);
  const damage = ee.FeatureCollection(
      'users/janak/FEMA_Damage_Assessments_Harvey_20170829');
  addLayer(map, damage, femaDamageLayerId);
  updatePovertyThreshold(povertyThreshold);

  createAssetCheckboxes();
}

function createAssetCheckboxes() {
  // TODO: these probably shouldn't just sit at the bottom of the page - move to
  // a better place.
  // TODO: add events on click.
  Object.keys(assets).forEach(assetName => createNewCheckbox(assetName));
  createNewCheckbox(priorityLayerName);
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

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, Google Map is initialized, and on successful
 * login, EE data is overlayed.
 */
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  // eslint-disable-next-line no-unused-vars
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
      '.apps.googleusercontent.com';
  // TODO(#13): This is from juliexxia's console. Should use one for
  // GiveDirectly. Also, this client id has not been properly configured yet.
  // const CLIENT_ID =
  // '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';

  google.charts.load('current', {packages: ['table', 'controls']});

  $(document).ready(function() {
    const defaultPovertyThreshold = 0.3;
    map = createMap();

    const runOnSuccess = function() {
      ee.initialize(
          /* opt_baseurl=*/ null, /* opt_tileurl=*/ null,
          () => run(defaultPovertyThreshold), createError('initializing EE'));
    };

    // Shows a button prompting the user to log in.
    // eslint-disable-next-line no-unused-vars
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
}

/**
 * Simple function that returns a lambda to print an error to console.
 *
 * @param {string} message
 * @return {Function}
 */
function createError(message) {
  // TODO(janakr): use some standard error library?
  return (error) => console.error('Error ' + message + ': ' + error);
}

setup();
