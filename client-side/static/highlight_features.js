import {geoidTag} from './property_names.js';

export {currentFeatures, highlightFeatures};

// TODO(janakr): should highlighted features be cleared when map is redrawn?
// Probably, but user might also want to keep track of highlighted districts
// even after a redraw.

// Keep track of displayed features so that we can remove them if deselected.
// Keys are geoids, values are DataFeature objects returned by the map.
// We expect one DataFeature object per geoid/feature, but the Maps interface
// returns a list, so we keep the list here unaltered to stay robust to any
// edge cases like disconnected districts or the like.
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
