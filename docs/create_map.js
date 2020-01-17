import {createBasicMap} from './basic_map.js';
import {geoPointToLatLng} from './map_util.js';

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
 * @param {Promise<DisasterDocument>} firebasePromise
 * @return {google.maps.Map}
 */
function createMap(firebasePromise) {
  const {map, searchBox} = createBasicMap(document.getElementById('map'));

  firebasePromise.then(({mapBounds}) => {
    map.fitBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(geoPointToLatLng(mapBounds.sw)),
        new google.maps.LatLng(geoPointToLatLng(mapBounds.ne))));
  });

  // Search box code roughly taken from
  // https://developers.google.com/maps/documentation/javascript/examples/places-searchbox.

  // Bias the SearchBox results towards current map's viewport.
  map.addListener('bounds_changed', () => searchBox.setBounds(map.getBounds()));

  let markers = [];
  // Listen for the event fired when the user selects a prediction and retrieve
  // more details for that place. This will fire along with the default handler
  // added in createBasicMap.
  searchBox.addListener('places_changed', () => {
    const places = searchBox.getPlaces();

    if (!places.length) {
      return;
    }

    // Clear out the old markers.
    markers.forEach((marker) => marker.setMap(null));
    markers = [];

    // For each place, get the icon, name and location.
    places.forEach((place) => {
      if (place.geometry && place.geometry.location) {
        // Create a marker for each place.
        markers.push(new google.maps.Marker({
          map: map,
          // Take the default params and add in the place-specific icon.
          icon: Object.assign({url: place.icon}, placeIconParams),
          title: place.name,
          position: place.geometry.location,
        }));
      }
    });
  });
  return map;
}
