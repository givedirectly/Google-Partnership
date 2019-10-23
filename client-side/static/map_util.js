export {
  convertEeObjectToPromise,
  findBounds,
  geoPointToLatLng,
  latLngToGeoPoint
};

function findBounds(features) {
  const bounds = new google.maps.LatLngBounds();
  for (const feature of features) {
    feature.getGeometry().forEachLatLng((latlng) => bounds.extend(latlng));
  }
  // Make sure we're sufficiently zoomed out for reasonable map context.
  const extendPoint1 = new google.maps.LatLng(
      Math.max(bounds.getNorthEast().lat(), bounds.getSouthWest().lat() + 0.1),
      Math.max(bounds.getNorthEast().lng(), bounds.getSouthWest().lng() + 0.1));
  const extendPoint2 = new google.maps.LatLng(
      Math.min(bounds.getSouthWest().lat(), bounds.getNorthEast().lat() - 0.1),
      Math.min(bounds.getSouthWest().lng(), bounds.getNorthEast().lng() - 0.1));
  bounds.extend(extendPoint1);
  bounds.extend(extendPoint2);
  return bounds;
}

/**
 * Converts Firestore geopoint into Google Maps LatLng pair.
 *
 * @param {firebase.firestore.GeoPoint} geopoint point to convert
 * @return {Object}
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
 * Transform an EE object into a standard Javascript Promise by wrapping its
 * evaluate call.
 *
 * @param {ee.ComputedObject} eeObject
 * @return {Promise<GeoJson>}
 */
function convertEeObjectToPromise(eeObject) {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((resolvedObject, error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(resolvedObject);
    });
  });
}