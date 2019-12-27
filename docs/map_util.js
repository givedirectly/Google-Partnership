export {
  geoPointToLatLng,
  latLngToGeoPoint,
  polygonToGeoPointArray,
  transformGeoPointArrayToLatLng,
};

/**
 * A literal lat-long that can be passed to Google Maps methods.
 * @typedef {Object} LatLngLiteral
 * {number} lng
 * {number} lat
 */

/**
 * Converts Firestore geopoint into Google Maps LatLng pair.
 *
 * @param {firebase.firestore.GeoPoint} geopoint point to convert
 * @return {LatLngLiteral}
 */
function geoPointToLatLng(geopoint) {
  return {lat: geopoint.latitude, lng: geopoint.longitude};
}

/**
 * Converts Google Maps LatLng object into Firestore geopoint.
 *
 * @param {google.maps.LatLng} latLng
 * @return {firebase.firestore.GeoPoint}
 */
function latLngToGeoPoint(latLng) {
  return new firebase.firestore.GeoPoint(latLng.lat(), latLng.lng());
}

/**
 * Converts first path of a Google Maps Polygon to Firestore GeoPoints.
 * @param {google.maps.Polygon} polygon
 * @return {Array<firebase.firestore.GeoPoint>}
 */
function polygonToGeoPointArray(polygon) {
  return polygon.getPath().getArray().map(latLngToGeoPoint);
}

/**
 * Transforms GeoPoint array to LatLng array.
 * @param {Array<firebase.firestore.GeoPoint>} geopoints
 * @return {Array<LatLngLiteral>}
 */
function transformGeoPointArrayToLatLng(geopoints) {
  const coordinates = [];
  geopoints.forEach((geopoint) => coordinates.push(geoPointToLatLng(geopoint)));
  return coordinates;
}
