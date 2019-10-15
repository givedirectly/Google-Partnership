import {geoidTag} from './property_names.js';

export {currentFeatures, CurrentFeatureValue, highlightFeatures};

// TODO(janakr): should highlighted features be cleared when map is redrawn?
// Probably, but user might also want to keep track of highlighted districts
// even after a redraw.

// Keep track of displayed features so that we can remove them if deselected.
// Keys are geoids, values are CurrentFeatureValue objects.
const currentFeatures = new Map();

/**
 * Values of the currentFeatures map. Contains DataFeature objects returned by
 * the map. We expect one DataFeature object per geoid/feature, but the Maps
 * interface returns a list, so we keep the list here unaltered to stay robust
 * to any edge cases like disconnected districts or the like. If a popup is
 * attached to the feature, also contains that.
 */
class CurrentFeatureValue {
  /**
   * @constructor
   * @param {Array<google.maps.Data.Feature>} dataFeatures
   */
  constructor(dataFeatures) {
    this.dataFeatures = dataFeatures;
  }

  /**
   * If the feature was highlighted via map click, this is the attached
   * info window.
   * @param {google.maps.InfoWindow} popup
   */
  setPopup(popup) {
    this.popup = popup;
  }
}

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
      const currentFeatureValue = currentFeatures.get(key);
      currentFeatureValue.dataFeatures.forEach((elt) => map.data.remove(elt));
      if (currentFeatureValue.popup) {
        currentFeatureValue.popup.close();
        currentFeatureValue.popup.setMap(null);
      }
      currentFeatures.delete(key);
    }
  }
  // Add new features.
  for (const [id, feature] of newFeatures.entries()) {
    // This is a JSON object representing a Google Maps API feature.
    const jsonFeature = {'type': 'Feature', 'geometry': feature.geometry};
    const dataFeatures = map.data.addGeoJson(jsonFeature);
    // Store the features so they can be removed later on deselect.
    currentFeatures.set(id, new CurrentFeatureValue(dataFeatures));
    dataFeatures.forEach(
        (item) => map.data.overrideStyle(
            item, {fillColor: 'red', strokeColor: 'red'}));
  }
}
