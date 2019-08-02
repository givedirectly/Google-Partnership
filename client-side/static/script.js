'use strict';

// Effective "namespace" for this script. See
// https://stackoverflow.com/questions/881515/how-do-i-declare-a-namespace-in-javascript
// for a number of approaches, including this one.
// TODO(janakr): verify that Google style guide actually sanctions this: I think
// maybe we're supposed to use modules, but I'm not sure yet.
const script_scope = {};

// Adds an EarthEngine layer (from EEObject.getMap()) to the given Google Map
// and returns the "overlay" that was added, in case the caller wants to add
// callbacks or similar to that overlay.
script_scope.addLayer = function(map, layerId) {
  const overlay = new ee.MapLayerOverlay(
      'https://earthengine.googleapis.com/map',
      layerId.mapid, layerId.token, {});
  // Show the EE map on the Google Map.
  map.overlayMapTypes.push(overlay);
  return overlay;
}

// Basic main function that initializes EarthEngine library and adds an image
// layer to the Google Map.
script_scope.run = function(map) {
   ee.initialize();
   const overlay = script_scope.addLayer(map, ee.Image('srtm90_v4').getMap({'min': 0, 'max': 1000}));
   // Show a count of the number of map tiles remaining.
   overlay.addTileCallback(function(event) {
     $('.tiles-loading').text(event.count + ' tiles remaining.');
     if (event.count === 0) {
       $('.tiles-loading').empty();
     }
   });
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, Google Map is initialized, and on successful
// login, EE data is overlayed.
// TODO(janakr): authentication seems buggy, investigate.
script_scope.setup = function() {
  // The client ID from the Google Developers Console.
  // TODO(janakr): This is from my console. Should use one for GiveDirectly.
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';

  $(document).ready(function() {
    // Create the base Google Map.
    const map = new google.maps.Map($('.map').get(0), {
          center: { lat: -34.397, lng: 150.644},
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
    ee.data.authenticate(CLIENT_ID, function() {script_scope.run(map)}, null, null, onImmediateFailed);
  });
};

script_scope.setup();
