'use strict';

// Effective "namespace" for this script. See
// https://stackoverflow.com/questions/881515/how-do-i-declare-a-namespace-in-javascript
// for a number of approaches, including this one.
// TODO(janakr): verify that Google style guide actually sanctions this: I think
// maybe we're supposed to use modules, but I'm not sure yet.
const scriptScope = {};

// Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
// and returns the "overlay" that was added, in case the caller wants to add
// callbacks or similar to that overlay.
scriptScope.addLayerFromId = function(map, layerId) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map',
      layerId.mapid, layerId.token, {});
  // Show the EE map on the Google Map.
  map.overlayMapTypes.push(overlay);
  return overlay;
}

// Convenience wrapper for addLayerFromId that calls getMap().
scriptScope.addLayer = function(map, layer) {
  return scriptScope.addLayerFromId(map, layer.getMap());
}

scriptScope.damageLevels = ee.List(['NOD', 'UNK', 'AFF', 'MIN', 'MAJ', 'DES']);
// TODO(janakr): figure out why ee.Dictionary.fromLists is not defined here.
scriptScope.damageScales =
    ee.Dictionary(['NOD', 0, 'UNK', 0, 'AFF', 1, 'MIN', 1, 'MAJ', 2, 'DES', 3,]);
scriptScope.zero = ee.Number(0);
scriptScope.priorityDisplayCap = ee.Number(99);
// TODO(janakr): this number probably needs to be user-adjusted, based on
// dataset.
scriptScope.scalingFactor = 4;

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
scriptScope.colorAndRate = function(feature, scalingFactor, povertyThreshold) {
  const rawRatio = ee.Number(feature.get('SNAP')).divide(feature.get('TOTAL'));
  const priority = ee.Number(ee.Algorithms.If(
    rawRatio.lte(povertyThreshold),
    scriptScope.zero,
    ee.Number(
        scriptScope.damageLevels.map(
            function (type) {
              return ee.Number(scriptScope.damageScales.get(type))
                  .multiply(feature.get(type));
            })
        .reduce(ee.Reducer.sum())))).divide(scale).round();
    return ee.Feature(
        feature.geometry(),
        ee.Dictionary(['GEOID', feature.get('GEOID'), 'PRIORITY', priority]))
            .set(
                {style: {color:
                          priority.min(scriptScope.priorityDisplayCap)
                              .format('ff00ff%02d')}});
}

scriptScope.processJoinedData = function(joinedData, scale, povertyThreshold) {
  return joinedData.map(
      function (feature) {
        return scriptScope.colorAndRate(feature, scale, povertyThreshold);
      });
}

// Basic main function that initializes EarthEngine library and adds an image
// layer to the Google Map.
scriptScope.run = function(map) {
  ee.initialize();
  const damage =
      ee.FeatureCollection(
          'users/janak/FEMA_Damage_Assessments_Harvey_20170829');

  const joinedSnap = ee.FeatureCollection('users/janak/texas-snap-join-damage');

  const defaultPovertyThreshold = 0.1;
  scriptScope.addLayer(map, damage);
  const processedData =
      scriptScope.processJoinedData(
          joinedSnap, scriptScope.scalingFactor, defaultPovertyThreshold);
  scriptScope.addLayer(
      map,
      processedData.style({styleProperty: "style"}),
          {},
          'Damage data for high poverty');
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, Google Map is initialized, and on successful
// login, EE data is overlayed.
// TODO(janakr): authentication seems buggy, investigate.
scriptScope.setup = function() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';

  $(document).ready(function() {
    // Create the base Google Map.
    const map = new google.maps.Map($('.map').get(0), {
          center: { lat: 29.76, lng: -95.36},
          zoom: 8
        });

    // Shows a button prompting the user to log in.
    const onImmediateFailed = function() {
      $('.g-sign-in').removeClass('hidden');
      $('.output').text('(Log in to see the result.)');
      $('.g-sign-in .button').click(function() {
        ee.data.authenticateViaPopup(function() {
          // If the login succeeds, hide the login button and run the analysis.
          $('.g-sign-in').addClass('hidden');
          runAnalysis();
        });
      });
    };

    // Attempt to authenticate using existing credentials.
    ee.data.authenticate(CLIENT_ID, function() {scriptScope.run(map)}, null, null, onImmediateFailed);
  });
};

scriptScope.setup();
