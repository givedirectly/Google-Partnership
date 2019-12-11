import mapStyles from './map_styles.js';

export {createBasicMap};

function createBasicMap(div, additionalOptions = {}) {
  // Create the base Google Map. Takes ~7 ms to execute this step.
  // Temporarily center on the center of the continental 48 states.
  // In practice, the firebase promise that normally determines the bounds
  // finishes so fast we don't actually see this happen unless there are no
  // bounds yet.
  const map = new google.maps.Map(
      div,
      {...{center: {lat: 39.8283, lng: -98.5795}, zoom: 4, styles: mapStyles}, ...additionalOptions});
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
  searchBox.addListener('places_changed', () => {
    const places = searchBox.getPlaces();
    if (!places.length) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    places.forEach((place) => {
      if (!place.geometry) {
        console.log('Returned place contains no geometry');
        return;
      }

      if (place.geometry.viewport) {
        // Only geocodes have viewport.
        bounds.union(place.geometry.viewport);
      } else {
        bounds.extend(place.geometry.location);
      }
    });
    map.fitBounds(bounds);
  });
  return {map, searchBox};
}
