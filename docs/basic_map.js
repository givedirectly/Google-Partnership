import mapStyles from './map_styles.js';

export {
  addPolygonWithPath,
  applyMinimumBounds,
  createBasicMap,
  defaultMapCenter,
  defaultZoomLevel,
};

// Contiguous United States.
const defaultMapCenter = {
  lat: 29.8283,
  lng: -98.5795,
};
const defaultZoomLevel = 4;

/**
 * Creates a fairly generic Google Map, centered on the United States. Has a
 * search box which will center the map on selected places, but not show
 * markers for those places.
 * @param {HTMLDivElement} div Div to put map into
 * @param {google.maps.MapOptions} additionalOptions Options that will be
 *     applied to the map, overriding any of this function's defaults
 * @return {{map: google.maps.Map, searchBox: google.maps.places.SearchBox}}
 */
function createBasicMap(div, additionalOptions = {}) {
  // Create the base Google Map. Takes ~7 ms to execute this step.
  // Temporarily center on the center of the continental 48 states.
  // In practice, the firebase promise that normally determines the bounds
  // finishes so fast we don't actually see this happen unless there are no
  // bounds yet.
  const map = new google.maps.Map(div, {
    ...{center: defaultMapCenter, zoom: defaultZoomLevel, styles: mapStyles},
    ...additionalOptions,
  });
  // Search box code roughly taken from
  // https://developers.google.com/maps/documentation/javascript/examples/places-searchbox.
  // Create the search box.
  const input = document.createElement('input');
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
  window.map = map;
  return {map, searchBox};
}

/**
 * Triggers an `overlaycomplete` event on `drawingManager` with a {@link
 * google.maps.Polygon} constructed using the given `polygonOptions`. Should
 * result in the polygon being drawn on the map.
 * @param {google.maps.PolygonOptions} polygonOptions
 * @param {google.maps.drawing.DrawingManager} drawingManager
 */
function addPolygonWithPath(polygonOptions, drawingManager) {
  const event = new Event('overlaycomplete');
  event.overlay = new google.maps.Polygon(polygonOptions);
  google.maps.event.trigger(drawingManager, 'overlaycomplete', event);
}

/**
 * Gives `map` the given `bounds`, except that if `bounds` are too small,
 * extends them so that they cover at least a 0.2 x 0.2 degree square.
 * @param {google.maps.LatLngBounds} bounds
 * @param {google.maps.Map} map
 */
function applyMinimumBounds(bounds, map) {
  const extendPoint1 = new google.maps.LatLng(
      Math.max(bounds.getNorthEast().lat(), bounds.getSouthWest().lat() + 0.1),
      Math.max(bounds.getNorthEast().lng(), bounds.getSouthWest().lng() + 0.1));
  const extendPoint2 = new google.maps.LatLng(
      Math.min(bounds.getSouthWest().lat(), bounds.getNorthEast().lat() - 0.1),
      Math.min(bounds.getSouthWest().lng(), bounds.getNorthEast().lng() - 0.1));
  bounds.extend(extendPoint1);
  bounds.extend(extendPoint2);
  map.fitBounds(bounds);
}
