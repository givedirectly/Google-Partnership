import {LayerType} from '../firebase_layers.js';
import {convertEeObjectToPromise} from '../map_util.js';
import {getCurrentLayers, updateLayersInFirestore} from './manage_layers_lib.js';
import {createLayerRow} from './add_disaster.js';

export {processNewEeLayer};

/**
 * Processes a new feature-collection-typed layer and puts its color column
 * info into firestore.
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
            // This is annoyingly indirect, but ee aggregate_values doesn't
            // aggregate equal values.
            ee.Dictionary(featureCollection.aggregate_histogram(property))
                .keys(),
            ee.List([]));
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
