import {disasterDocumentReference} from '../firestore_document.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {getDamageBounds, storeBounds, getLatLngPromiseFromEeRectangle, saveBounds};

/**
 * Adds the lat and lng of a feature's centroid as properties.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function withGeo(feature) {
  const centroid = feature.centroid().geometry().coordinates();
  return feature.set('lng', centroid.get(0), 'lat', centroid.get(1));
}

function getDamageBounds(features) {
  const damageWithCoords = ee.FeatureCollection(features.map(withGeo));
  // This is assuming we're not crossing the international date line...
  return ee.Geometry.Rectangle([
    damageWithCoords.aggregate_min('lng'),
    damageWithCoords.aggregate_min('lat'),
    damageWithCoords.aggregate_max('lng'),
    damageWithCoords.aggregate_max('lat'),
  ]);
}

/**
 * Stores an approximate bounds around a given feature collection.
 *
 * @param {ee.FeatureCollection} features the featureCollection around which you
 * want to orient the map
 * @return {Promise<Array<number>>} Promise that completes with array of bounds
 * after Firestore write is complete.
 */
function storeBounds(rectanglePromise) {
  return rectanglePromise.then((results) => saveBounds(results));
}

/**
 * Writes the calculated bounds to firestore.
 * @param {Array<number>} rectangle
 * @return {Promise<Array<number>>} Promise that completes with array of bounds
 * after Firestore write is complete.
 */
function saveBounds(latLngBounds) {
  const docData = {
    'map-bounds': {
      sw: makeGeoPointFromLatLng(latLngBounds[0]),
      ne: makeGeoPointFromLatLng(latLngBounds[1]),
    },
  };
  return disasterDocumentReference()
      .set(docData, {merge: true})
      .then(() => rectangle);
}

function getLatLngPromiseFromEeRectangle(eeRectangle) {
  return convertEeObjectToPromise(eeRectangle).then((rectangle) => {
    const coordinates = rectangle.coordinates[0];
    const sw = coordinates[0];
    const ne = coordinates[2];
    return [{lat: sw[1], lng: sw[0]}, {lat: ne[1], lng: ne[0]}];
  });
}

function makeGeoPointFromLatLng(latLng) {
  return new firebase.firestore.GeoPoint(latLng.lat, latLng.lng);
}
