import {convertEeObjectToPromise} from '../map_util.js';
import {createLayerRow, createTd, getCurrentLayers, updateLayersInFirestore} from './add_disaster.js';
import {withColor} from './color_function_util.js';

export {processNewFeatureLayer};
/**
 * One-off function for processing a feature-collection-typed layer and putting
 * its color column info into firestore.
 * @return {Promise<void>} Finishes when the property information has been
 * written to firestore.
 */
function processNewFeatureLayer(asset, type) {
  console.log(asset);
  switch (type) {
    case 'IMAGE':
    case 'IMAGE COLLECTION':
    case 'TABLE':
      console.log(asset, type);
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
              'asset-type': 1,
              'ee-name': asset,
              'color-function': {
                'columns': columns,
                'current-style': 2,
                'colors': {},
              },
              'display-name': '',
              'display-on-load': false
            };
            console.log(layer);
            const index = getCurrentLayers().length;
            getCurrentLayers().push(layer);
            prependToTable(layer, index);
            console.log(getCurrentLayers());
            return updateLayersInFirestore();
          });
  }
}

function prependToTable(layer, index) {
  $('#tbody').prepend(createLayerRow(layer, index));
}
