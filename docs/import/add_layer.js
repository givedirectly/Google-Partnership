import {eeLegacyPrefix} from '../ee_paths.js';
import {convertEeObjectToPromise} from '../ee_promise_cache.js';
import {LayerType} from '../firebase_layers.js';

import {createLayerRow} from './manage_layers.js';
import {getCurrentLayers, updateLayersInFirestore} from './manage_layers_lib.js';

export {getExemplars, processNewEeLayer, processNonEeLayer};

/** Documentation */
function getExemplars(featureCollection, property) {
  return ee.Algorithms.If(
      ee.Number(featureCollection.aggregate_count_distinct(property))
          .lte(ee.Number(25)),
      // This is annoyingly indirect, but ee aggregate_values doesn't
      // aggregate equal values.
      ee.Dictionary(featureCollection.aggregate_histogram(property)).keys(),
      ee.List([]));
}

/**
 * Processes a new feature-collection-typed layer and puts its color column
 * info into firestore.
 * @param {string} asset ee asset path
 * @param {enum} type LayerType
 * @return {Promise<void>} Finishes when the property information has been
 * written to firestore.
 */
function processNewEeLayer(asset, type) {
  ee.data.setAssetAcl(
      eeLegacyPrefix + asset, {all_users_can_read: true}, () => {
        console.log('Made ' + eeLegacyPrefix + asset + ' world readable');
      });
  switch (type) {
    case LayerType.IMAGE:
    case LayerType.IMAGE_COLLECTION:
      return prependToTable(createCommonEeLayerFields(asset, type));
    case LayerType.FEATURE_COLLECTION:
      const featureCollection = ee.FeatureCollection(asset);
      const properties = featureCollection.first().propertyNames();
      const stats = properties.map((property) => {
        const max = featureCollection.aggregate_max(property);
        const min = featureCollection.aggregate_min(property);
        const values = getExemplars(featureCollection, property);
        return ee.Dictionary.fromLists(
            ['max', 'min', 'values'], [max, min, values]);
      });
      return convertEeObjectToPromise(
                 ee.Dictionary.fromLists(properties, stats))
          .then((columns) => {
            const layer = {
              ...createCommonEeLayerFields(asset, type),
              colorFunction: {
                columns: columns,
                currentStyle: 2,
                lastByPropertyStyle: 0,
                colors: {},
              },
            };
            return prependToTable(layer);
          });
  }
}

/**
 * Create fields that all ee layers have.
 * @param {string} asset
 * @param {LayerType} type
 * @return {Object}
 */
function createCommonEeLayerFields(asset, type) {
  return {
    assetType: type,
    eeName: asset,
    displayName: '',
    displayOnLoad: false,
  };
}

/**
 * Given a new layer, adds to table and firestore.
 * @param {Object} layer
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function prependToTable(layer) {
  const index = getCurrentLayers().length;
  getCurrentLayers().push(layer);
  const newRow = createLayerRow(layer, index);
  $('#tbody').prepend(newRow);
  newRow.children('.color-td').trigger('click');
  return updateLayersInFirestore();
}

/**
 * Adds a new non-ee layer to the table and firestore.
 * @param {enum} type The LayerType (kml or map tile)
 * @param  {Array<string>} urls The urls for the layer display
 * @return {Promise<void>} Finishes when the layer information has been
 * written to firestore.
 */
function processNonEeLayer(type, urls) {
  const layer = {
    displayName: '',
    assetType: type,
    urls: urls,
    displayOnLoad: false,
  };
  return prependToTable(layer);
}
