import {disasterDocumentReference} from '../firestore_document.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {getDamageBounds, getLatLngBoundsPromiseFromEeRectangle, saveBounds};

/**
 * Adds the lat and lng of a feature's centroid as properties.
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function withGeo(feature) {
  const centroid = feature.centroid().geometry().coordinates();
  return feature.set('lng', centroid.get(0), 'lat', centroid.get(1));
}

/**
 * Calculates approximate bounds around a given {@link ee.FeatureCollection}.
 * @param {ee.FeatureCollection} features
 * @returns {ee.Geometry.Rectangle} Rectangle around the given bounds.
 */
function getDamageBounds(features) {
  const damageWithCoords = ee.FeatureCollection(features.map(withGeo));
  // This is assuming we're not crossing the international date line...
  return ee.Geometry.Rectangle([
    fudgeBound(damageWithCoords.aggregate_min('lng'), false),
    fudgeBound(damageWithCoords.aggregate_min('lat'), false),
    fudgeBound(damageWithCoords.aggregate_max('lng'), true),
    fudgeBound(damageWithCoords.aggregate_max('lat'), true),
  ]);
}

/**
 * Writes the given bounds to firestore.
 * @param {{sw: {lng: number, lat: number}, ne: {lng: number, lat: number}}}
 *     latLngBounds
 * @return {Promise} Promise that completes when Firestore write is complete.
 */
function saveBounds(latLngBounds) {
  const docData = {
    'map-bounds': {
      sw: makeGeoPointFromLatLng(latLngBounds.sw),
      ne: makeGeoPointFromLatLng(latLngBounds.ne),
    },
  };
  return disasterDocumentReference().set(docData, {merge: true});
}

/**
 * @param {ee.Geometry.Rectangle} eeRectangle
 * @returns {Promise<{sw: {lng: number, lat: number}, ne: {lng: number, lat:
 *     number}}>}
 */
function getLatLngBoundsPromiseFromEeRectangle(eeRectangle) {
  return convertEeObjectToPromise(eeRectangle).then((rectangle) => {
    const coordinates = rectangle.coordinates[0];
    const sw = coordinates[0];
    const ne = coordinates[2];
    return {sw: {lat: sw[1], lng: sw[0]}, ne: {lat: ne[1], lng: ne[0]}};
  });
}

/**
 * Converts LatLng into Firestore GeoPoint.
 * @param {{lng: number, lat: number}} latLng
 * @returns {firebase.firestore.GeoPoint}
 */
function makeGeoPointFromLatLng(latLng) {
  return new firebase.firestore.GeoPoint(latLng.lat, latLng.lng);
}

/**
 * Fudges number that's part of a bound so our bounds aren't too tight, since
 * bounds are at the neighborhood level: https://xkcd.com/2170/. This helps to
 * avoid clipping off a census block group that contains damage.
 * @param {ee.Number} number
 * @param {boolean} fudgeUp Whether to fudge up (NE corner) or down (SW corner)
 * @returns {ee.Number} fudged number
 */
function fudgeBound(number, fudgeUp) {
  return ee.Number(number).add(fudgeUp ? 0.01 : -0.01);
}