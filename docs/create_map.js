import {POLYGON_HELP_URL} from './help.js';
import {geoPointToLatLng} from './map_util.js';
import {setUpPolygonDrawing} from './polygon_draw.js';
import {createBasicMap} from './basic_map.js';

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
  const {map, searchBox} = createBasicMap(document.getElementById('map'));

  firebasePromise.then((doc) => {
    const mapBounds = doc.data()['map-bounds'];
    map.fitBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(geoPointToLatLng(mapBounds.sw)),
        new google.maps.LatLng(geoPointToLatLng(mapBounds.ne))));
  });
  setUpPolygonDrawing(map, firebasePromise);

  // Add the help link.
  const helpContainer = document.createElement('div');
  helpContainer.style.padding = '6px';
  const helpLink = document.createElement('a');
  helpLink.href = POLYGON_HELP_URL;
  helpLink.target = '_blank';
  helpLink.style.fontSize = '18px';
  const helpIcon = document.createElement('i');
  helpIcon.className = 'help fa fa-question-circle';
  helpIcon.setAttribute('aria-hidden', 'true');
  helpLink.appendChild(helpIcon);
  helpContainer.appendChild(helpLink);
  map.controls[google.maps.ControlPosition.TOP_LEFT].insertAt(0, helpContainer);

  // Search box code roughly taken from
  // https://developers.google.com/maps/documentation/javascript/examples/places-searchbox.

  // Bias the SearchBox results towards current map's viewport.
  map.addListener('bounds_changed', () => searchBox.setBounds(map.getBounds()));

  let markers = [];
  // Listen for the event fired when the user selects a prediction and retrieve
  // more details for that place.
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
    });
  });
  return map;
}
