import {convertEeObjectToPromise} from '../map_util.js';
import {createLayerRow} from './add_disaster.js';
import {getCurrentLayers, updateLayersInFirestore} from './add_disaster_util.js';
import {LayerType} from '../firebase_layers';

export {processNewEeLayer};
/**
 * One-off function for processing a new feature-collection-typed layer and
 * putting its color column info into firestore.
 * @param {string} asset ee asset path
 * @param {enum} type LayerType
 * @return {Promise<void>} Finishes when the property information has been
 * written to firestore.
 */
function processNewEeLayer(asset, type) {
  switch (type) {
    case LayerType.IMAGE:
    case LayerType.IMAGE_COLLECTION:
      const layer = {
        'asset-type': type,
        'ee-name': asset,
        'display-name': '',
        'display-on-load': false,
      };
      return prependToTable(layer);
    case LayerType.FEATURE_COLLECTION:
      const featureCollection = ee.FeatureCollection(asset);
      const properties = featureCollection.first().propertyNames();
      const stats = properties.map((property) => {
        const max = featureCollection.aggregate_max(property);
        const min = featureCollection.aggregate_min(property);
        const values = ee.Algorithms.If(
            ee.Number(featureCollection.aggregate_count_distinct(property))
                .lte(ee.Number(25)),
            featureCollection.aggregate_array(property), ee.List([]));
        return ee.Dictionary.fromLists(
            ['max', 'min', 'values'], [max, min, values]);
      });
      return convertEeObjectToPromise(
                 ee.Dictionary.fromLists(properties, stats))
          .then((columns) => {
            const layer = {
              'asset-type': type,
              'ee-name': asset,
              'color-function': {
                'columns': columns,
                'current-style': 2,
                'colors': {},
              },
              'display-name': '',
              'display-on-load': false,
            };
            return prependToTable(layer);
          });
  }
}

/**
 * Given a new layer, adds to table and firestore.
 * @param {Object} layer
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function prependToTable(layer) {
  const index = getCurrentLayers().length;
  getCurrentLayers().push(layer);
  $('#tbody').prepend(createLayerRow(layer, index));
  return updateLayersInFirestore();
}
