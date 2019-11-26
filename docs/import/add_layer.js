import {convertEeObjectToPromise} from '../map_util.js';
import {getCurrentLayers, updateLayersInFirestore} from './add_disaster.js';

export {processNewFeatureLayer};

/**
 * One-off function for processing a feature-collection-typed layer and putting
 * its color column info into firestore.
 * @return {Promise<void>} Finishes when the property information has been
 * written to firestore.
 */
function processNewFeatureLayer(layerIndex) {
  const layer = getCurrentLayers()[layerIndex];
  const featureCollection = ee.FeatureCollection(layer['ee-name']);
  const properties = featureCollection.first().propertyNames();
  // TODO: check if there are over ~50 distinct values and don't do evaluate
  // on the values if so.
  const stats = properties.map((property) => {
    const max = featureCollection.aggregate_max(property);
    const min = featureCollection.aggregate_min(property);
    const values = featureCollection.aggregate_array(property);
    return ee.Dictionary.fromLists(
        ['max', 'min', 'values'], [max, min, values]);
  });
  return convertEeObjectToPromise(ee.Dictionary.fromLists(properties, stats))
      .then((columns) => {
        layer['color-function']['columns'] = columns;
        return updateLayersInFirestore();
      });
}