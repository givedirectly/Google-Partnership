import {getCurrentLayers, updateLayersInFirestore} from './add_disaster_util.js';

export {processNewFeatureLayer};

const layerIndex = 4;

/**
 * One off function for processing a feature collection typed layer and putting
 * its color column info into firestore.
 */
function processNewFeatureLayer() {
  const layer = getCurrentLayers()[layerIndex];
  const featureCollection = ee.FeatureCollection(layer['ee-name']);
  const properties = featureCollection.first().toDictionary().keys();
  const stats = properties.map((property) => {
    const max = featureCollection.aggregate_max(property);
    const min = featureCollection.aggregate_min(property);
    const values = ee.List(
        ee.Dictionary(featureCollection.aggregate_histogram(property)).keys());
    return ee.List([
      property,
      ee.Dictionary.fromLists(['max', 'min', 'values'], [max, min, values]),
    ]);
  });
  const keys = stats.map((stat) => ee.List(stat).get(0));
  const vals = stats.map((stat) => ee.List(stat).get(1));
  ee.Dictionary.fromLists(keys, vals).evaluate((columns) => {
    layer['color-function']['columns'] = columns;
    updateLayersInFirestore();
  });
}
