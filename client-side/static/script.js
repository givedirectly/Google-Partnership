import drawTable from './draw_table.js';
import setUpPolygonDrawing from './polygon_draw.js';

export {geoidTag, priorityTag, snapTag};
export {run as default};

// Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
// and returns the "overlay" that was added, in case the caller wants to add
// callbacks or similar to that overlay.
function addLayerFromId(map, layerId) {
  const overlay =
      new ee.MapLayerOverlay(
          'https://earthengine.googleapis.com/map',
          layerId.mapid,
          layerId.token,
          {});
  // Show the EE map on the Google Map.
  map.overlayMapTypes.push(overlay);
  return overlay;
}

// Asynchronous wrapper for addLayerFromId that calls getMap() with a callback
// to avoid blocking on the result.
function addLayer(map, layer) {
  layer.getMap({
        callback: function(layerId, failure) {
            if (layerId) {
              addLayerFromId(map, layerId);
            } else {
              createError('getting id')(failure);
            }
    }});
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
        // Keep key order same as @const headings in ./draw_table.js
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

// Basic main function that initializes EarthEngine library and adds an image
// layer to the Google Map.
function run(povertyThreshold) {
  // Create the base Google Map (we could also keep this around as a global 
  // variable - not sure which is better)
  const map = new google.maps.Map($('.map').get(0), {
        center: { lat: 29.76, lng: -95.36},
        zoom: 8
      });
  damageScales = ee.Dictionary.fromLists(damageLevels, [0, 0, 1, 1, 2, 3]);
  setUpPolygonDrawing(map);
  const damage =
      ee.FeatureCollection(
          'users/janak/FEMA_Damage_Assessments_Harvey_20170829');

  const joinedSnap = ee.FeatureCollection('users/janak/texas-snap-join-damage');
  addLayer(map, damage);
  const processedData =
      processJoinedData(
          joinedSnap, scalingFactor, povertyThreshold);
  addLayer(
      map,
      processedData.style({styleProperty: "style"}),
          {},
          'Damage data for high poverty');
  google.charts.setOnLoadCallback(function(){drawTable(processedData, povertyThreshold)});
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, Google Map is initialized, and on successful
// login, EE data is overlayed.
// TODO(janakr): authentication seems buggy, investigate.
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  // const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';
  // TODO(#13): This is from juliexxia's console. Should use one for
  // GiveDirectly. Also, this client id has not been properly configured yet.
  const CLIENT_ID = '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';
  
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
