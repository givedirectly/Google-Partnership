export {
  convertEeObjectToPromise,
  geoPointToLatLng,
  latLngToGeoPoint,
    pathToGeoPointArray,
    transformGeoPointArrayToLatLng,
};

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

function pathToGeoPointArray(polygon) {
  return polygon.getPath().getArray().map(latLngToGeoPoint);
}

/**
 * Transforms GeoPoint array to LatLng array.
 * @param {Array<firebase.firestore.GeoPoint>} geopoints
 * @return {Array<LatLng>} Array is actually just lat-lng pairs, but good enough
 */
function transformGeoPointArrayToLatLng(geopoints) {
  const coordinates = [];
  geopoints.forEach((geopoint) => coordinates.push(geoPointToLatLng(geopoint)));
  return coordinates;
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
