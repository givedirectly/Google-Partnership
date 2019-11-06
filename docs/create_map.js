import mapStyles from './map_styles.js';
import {geoPointToLatLng} from './map_util.js';
import setUpPolygonDrawing from './polygon_draw.js';
import {getDisaster, getResources} from './resources.js';

export {createMap as default};

const placeIconParams = {
  size: new google.maps.Size(71, 71),
  origin: new google.maps.Point(0, 0),
  anchor: new google.maps.Point(17, 34),
  scaledSize: new google.maps.Size(25, 25),
};

/**
 * Creates, initializes and returns a map with search box and drawing tools.
 *
 * @param {Promise<firebase.firestore.DocumentSnapshot>} firebasePromise Promise
 *     with disaster metadata
 * @return {google.maps.Map}
 */
function createMap(firebasePromise) {
  // Create the base Google Map. Takes ~7 ms to execute this step.
  // Temporarily center on the center of the continental 48 states.
  // In practice, the firebase promise finishes so fast we don't actually
  // see this happen.
  const map = new google.maps.Map(
      $('.map').get(0),
      {center: {lat: 39.8283, lng: -98.5795}, styles: mapStyles});

  firebasePromise.then((doc) => {
    map.fitBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(geoPointToLatLng(doc.data()['map-bounds'].sw)),
        new google.maps.LatLng(geoPointToLatLng(doc.data()['map-bounds'].ne))));
  });
  setUpPolygonDrawing(map, firebasePromise);

  // Search box code roughly taken from
  // https://developers.google.com/maps/documentation/javascript/examples/places-searchbox.

  // Create the search box.
  // Normally we would just steal this element from the html, but the map does
  // weird grabby things with it, which don't seem worth working around.
  const input = document.createElement('INPUT');
  input.setAttribute('type', 'text');
  input.setAttribute('placeholder', 'Search');
  const searchBox = new google.maps.places.SearchBox(input);
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

  // Bias the SearchBox results towards current map's viewport.
  map.addListener('bounds_changed', function() {
    searchBox.setBounds(map.getBounds());
  });

  let markers = [];
  // Listen for the event fired when the user selects a prediction and retrieve
  // more details for that place.
  searchBox.addListener('places_changed', function() {
    const places = searchBox.getPlaces();

    if (!places.length) {
      return;
    }

    // Clear out the old markers.
    markers.forEach((marker) => marker.setMap(null));
    markers = [];

    // For each place, get the icon, name and location.
    const bounds = new google.maps.LatLngBounds();
    places.forEach(function(place) {
      if (!place.geometry) {
        console.log('Returned place contains no geometry');
        return;
      }

      // Create a marker for each place.
      markers.push(new google.maps.Marker({
        map: map,
        // Take the default params and add in the place-specific icon.
        icon: Object.assign({url: place.icon}, placeIconParams),
        title: place.name,
        position: place.geometry.location,
      }));

      if (place.geometry.viewport) {
        // Only geocodes have viewport.
        bounds.union(place.geometry.viewport);
      } else {
        bounds.extend(place.geometry.location);
      }
    });
    map.fitBounds(bounds);
  });
  return map;
}
