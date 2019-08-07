import drawtable from './draw_table.js';
import setUpPolygonDrawing from './polygon_draw.js';

export {geoidTag, priorityTag, snapTag};
export {run as default};

// Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
// and returns the "overlay" that was added, in case the caller wants to add
// callbacks or similar to that overlay.
function addLayerFromId(map, layerId) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map',
      layerId.mapid, layerId.token, {});
  // Show the EE map on the Google Map.
  map.overlayMapTypes.push(overlay);
  return overlay;
}

// Convenience wrapper for addLayerFromId that calls getMap().
function addLayer(map, layer) {
  return addLayerFromId(map, layer.getMap());
}

 const damageLevels = ee.List(['NOD', 'UNK', 'AFF', 'MIN', 'MAJ', 'DES']);
// TODO(janakr): figure out why ee.Dictionary.fromLists is not defined here.
const damageScales =
    ee.Dictionary(['NOD', 0, 'UNK', 0, 'AFF', 1, 'MIN', 1, 'MAJ', 2, 'DES', 3,]);
const zero = ee.Number(0);
const priorityDisplayCap = ee.Number(99);
// TODO(janakr): this number probably needs to be user-adjusted, based on
// dataset.
const scalingFactor = 4;
const geoidTag= 'GEOID';
const priorityTag = 'PRIORITY';
const snapTag = 'SNAP PERCENTAGE';

// Cutoff for SNAP reciepients/population
const defaultPovertyThreshold = 0.3;

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
        // Keep key order same as @const headings in ./draw_dashboard.js
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
  // Create the base Google Map.
  const map = new google.maps.Map($('.map').get(0), {
        center: { lat: 29.76, lng: -95.36},
        zoom: 8
      });

  setUpPolygonDrawing(map);
  const damage =
      ee.FeatureCollection(
          'users/janak/FEMA_Damage_Assessments_Harvey_20170829');

  const joinedSnap = ee.FeatureCollection('users/janak/texas-snap-join-damage');

  addLayer(map, damage);
  const processedData =
      processJoinedData(
          joinedSnap, scalingFactor, povertyThreshold);
  console.log(processedData.size().getInfo());
  addLayer(
      map,
      processedData.style({styleProperty: "style"}),
          {},
          'Damage data for high poverty');
  google.charts.setOnLoadCallback(function(){drawDashboard(processedData, povertyThreshold)});
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, Google Map is initialized, and on successful
// login, EE data is overlayed.
// TODO(janakr): authentication seems buggy, investigate.
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  // const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';
  // TODO(#13): This is from juliexxia's console. Should use one for GiveDirectly.
  const CLIENT_ID = '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';
  
  google.charts.load('current', {packages: ['table', 'controls']});   

  $(document).ready(function() {
    ee.initialize();
    const runOnSuccess = function() {run(map, defaultPovertyThreshold)};

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
    //ee.data.authenticate(CLIENT_ID, runOnSuccess, null, null, onImmediateFailed);
    run(defaultPovertyThreshold);
  });
};

setup();
