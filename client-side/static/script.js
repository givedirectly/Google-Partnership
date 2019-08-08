import drawTable from './draw_table.js';
import setUpPolygonDrawing from './polygon_draw.js';

export {geoidTag, priorityTag, snapTag, zero};
export {run as default};

// Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
// and returns the "overlay" that was added, in case the caller wants to add
// callbacks or similar to that overlay.
function addLayerFromId(map, layerId, layerName) {
  const overlay =
      new ee.MapLayerOverlay(
          'https://earthengine.googleapis.com/map',
          layerId.mapid,
          layerId.token,
          {});
  // Show the EE map on the Google Map.
  const numLayers = map.overlayMapTypes.push(overlay);
  layerIndexMap.set(layerName, numLayers-1);
  console.log(layerIndexMap);
  return overlay;
}

// Asynchronous wrapper for addLayerFromId that calls getMap() with a callback
// to avoid blocking on the result.
function addLayer(map, layer, layerName) {
  layer.getMap({
        callback: function(layerId, failure) {
            if (layerId) {
              addLayerFromId(map, layerId, layerName);
              console.log(layerId);
            } else {
              createError('getting id')(failure);
            }
    }});
}

function removeLayer(map, layerName) {
  const index = layerIndexMap.get(layerName);
  if (typeof index !== 'undefined') {
    console.log("removing layer " + layerName + " at index " + index);
    map.overlayMapTypes.removeAt(index);
  } else {
    console.log("layer removal failed - no layer by name " + layerName + " stored in layer index map");
  }
}

const damageLevels = ee.List(['NOD', 'UNK', 'AFF', 'MIN', 'MAJ', 'DES']);
// Initialized lazily, after ee.initialize() creates necessary function.
let damageScales = null;
const zero = ee.Number(0);
const priorityDisplayCap = ee.Number(99);
// TODO(janakr): this number probably needs to be user-adjusted, based on
// dataset.
const scalingFactor = 4;
const geoidTag = 'GEOID';
const priorityTag = 'PRIORITY';
const snapTag = 'SNAP PERCENTAGE';

// we keep a map of layer name to array position in overlayMapTypes for easy removal
const priorityLayerId = 'priority';
const femaDamageLayerId = 'fema';

const layerIndexMap = new Map();

// Processes a feature corresponding to a geographic area and returns a new one,
// with just the GEOID and PRIORITY properties set, and a style attribute that
// sets the color/opacity based on the priority, with all priorities past 99
// equally opaque.
//
// povertyThreshold is used to filter out areas that are not poor enough (as
// determined by the areas SNAP and TOTAL properties).
//
// scalingFactor divides the raw priority, it can be adjusted to make sure that
// there are not too many priorities >99 (which all display the same on the
// map).
function colorAndRate(feature, scalingFactor, povertyThreshold) {
  const rawRatio = ee.Number(feature.get('SNAP')).divide(feature.get('TOTAL'));
  const priority = ee.Number(ee.Algorithms.If(
    rawRatio.lte(povertyThreshold),
    zero,
    ee.Number(
        damageLevels.map(
            function (type) {
              return ee.Number(damageScales.get(type))
                  .multiply(feature.get(type));
            })
        .reduce(ee.Reducer.sum())))).divide(scalingFactor).round();
    return ee.Feature(
        feature.geometry(),
        ee.Dictionary(
          [geoidTag, feature.get(geoidTag),
          priorityTag, priority,
          snapTag, rawRatio]))
            .set(
                {style: {color:
                          priority.min(priorityDisplayCap)
                              .format('ff00ff%02d')}});
}

function processJoinedData(joinedData, scale, povertyThreshold) {
  return joinedData.map(
      function (feature) {
        return colorAndRate(feature, scale, povertyThreshold);
      });
}

// The base Google Map
// TODO: this is centered for Harvey right now - generalize.
const map = new google.maps.Map($('.map').get(0), {
  center: { lat: 29.76, lng: -95.36},
  zoom: 8
});
const joinedSnap = ee.FeatureCollection('users/janak/texas-snap-join-damage');

function update(povertyThreshold) {
  removeLayer(map, priorityLayerId)

  const processedData =
      processJoinedData(
          joinedSnap, scalingFactor, povertyThreshold);
  addLayer(
      map,
      processedData.style({styleProperty: "style"}),
      priorityLayerId);
          // {},
          // 'Damage data for high poverty');
  google.charts.setOnLoadCallback(function(){drawTable(processedData, povertyThreshold)});
}

// Main function that processes the data (FEMA damage, SNAP) and creates/populates
// the map and table with a new poverty threshold.
function run(povertyThreshold) {
  setUpPolygonDrawing(map);
  damageScales = ee.Dictionary.fromLists(damageLevels, [0, 0, 1, 1, 2, 3]);
  const damage =
      ee.FeatureCollection(
          'users/janak/FEMA_Damage_Assessments_Harvey_20170829');
  addLayer(map, damage, femaDamageLayerId);
  update(povertyThreshold);
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, Google Map is initialized, and on successful
// login, EE data is overlayed.
// TODO(janakr): authentication seems buggy, investigate.
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';
  // TODO(#13): This is from juliexxia's console. Should use one for
  // GiveDirectly. Also, this client id has not been properly configured yet.
  // const CLIENT_ID = '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';
  
  google.charts.load('current', {packages: ['table', 'controls']});   

  $(document).ready(function() {
    const defaultPovertyThreshold = 0.3;
    const runOnSuccess = function() {
      ee.initialize(
          /*opt_baseurl=*/null,
          /*opt_tileurl=*/null,
          function() {run(defaultPovertyThreshold)},
          createError('initializing EE'));
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
