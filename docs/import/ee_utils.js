export {listEeAssets};

/**
 * Lists all assets in an EarthEngine asset folder via {@link
 * ee.data.listAssets}, taking care of multi-page listings.
 * @param {string} path Fully qualified EE path, suitable for passing to {@link
 *     ee.data.listAssets}
 * @return {Promise<Array<{type: string, id: string}>>} Promise of array of
 *     EarthEngineAsset objects, having at least a `type` field which can
 *     include `TABLE`, `IMAGE`, or `IMAGE_COLLECTION`, and an `id` field which
 *     is the path to the asset, without the
 *     `projects/earthengine-legacy/assets/` prefix
 */
function listEeAssets(path) {
  const result = [];
  return listAssetsRecursive(path, result, null).then(() => result);
}

/**
 * Helper function for {@link listEeAssets}.
 * @param {string} path See {@link listEeAssets}
 * @param {Array<{type: string, id: string}>} result Accumulated results,
 *     eventually returned by {@link listEeAssets}
 * @param {?string} pageToken Point at which to start the listing, returned
 *     by {@link ee.data.listAssets} in the `next_page_token` field when the
 *     listing is too long
 * @return {Promise<void>} Promise that completes when all listings are done
 */
function listAssetsRecursive(path, result, pageToken) {
  return ee.data
      .listAssets(path, pageToken ? {page_token: pageToken} : {}, () => {})
      .then((listAssetsResult) => {
        if (!listAssetsResult) {
          return;
        }
        if (listAssetsResult.assets) {
          result.push(...listAssetsResult.assets);
        }
        if (listAssetsResult.next_page_token) {
          return listAssetsRecursive(
              path, result, listAssetsResult.next_page_token);
        }
      });
}
