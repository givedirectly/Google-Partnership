import {geoidTag} from './process_joined_data.js';

export {highlightFeatures as default};

// TODO(janakr): should highlighted features be cleared when map is redrawn?
// Probably, but user might also want to keep track of highlighted districts
// even after a redraw.

// Keep track of displayed features so that we can remove them if deselected.
// Keys are geoids, values are DataFeature objects returned by the map.
const currentFeatures = new Map();

/**
 * Takes a list of EE features and displays their geometries on the Google Maps
 * API map.
 *
 * @param {Array} features Must have been returned from an
 *     ee.ComputedObject.evaluate call, so that access to them is safe! In
 *     particular, they are JSON objects, not ee.Feature objects.
 * @param {google.maps.Map} map
 */
function highlightFeatures(features, map) {
  const newFeatures = new Map();
  for (const feature of features) {
    newFeatures.set(feature.properties[geoidTag], feature);
  }
  // Remove any features that are not in the new set.
  const keys = currentFeatures.keys();
  for (const key of keys) {
    if (!newFeatures.delete(key)) {
      currentFeatures.get(key).forEach((elt) => map.data.remove(elt));
      currentFeatures.delete(key);
    }
  }
  // Add new features.
  for (const [id, feature] of newFeatures.entries()) {
    // This is a JSON object representing a Google Maps API feature.
    const jsonFeature = {'type': 'Feature', 'geometry': feature.geometry};
    const dataFeatures = map.data.addGeoJson(jsonFeature);
    // Store the features so they can be removed later on deselect.
    currentFeatures.set(id, dataFeatures);
    dataFeatures.forEach(
        (item) => map.data.overrideStyle(
            item, {fillColor: 'red', strokeColor: 'red'}));
  }
}
