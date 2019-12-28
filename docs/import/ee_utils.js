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
  return listAssetsHelper(path, result, null).then(() => result);
}

/**
 * Helper function for {@link listEeAssets}. If result from
 * {@link ee.data.listAssets} has `next_page_token`, makes another request.
 * @param {string} path See {@link listEeAssets}
 * @param {Array<{type: string, id: string}>} result Accumulated results,
 *     eventually returned by {@link listEeAssets}
 * @param {?string} pageToken Point at which to start the listing, returned
 *     by {@link ee.data.listAssets} in the `next_page_token` field when the
 *     listing is too long
 * @return {Promise<void>} Promise that completes when all listings are done
 */
async function listAssetsHelper(path) {
  let listAssetsResult = null;
  let pageToken = null;
  const result = [];
  while (listAssetsResult === null || pageToken) {
    listAssetsResult = await ee.data.listAssets(
        path, pageToken ? {page_token: pageToken} : {}, () => {});
    if (!listAssetsResult) {
      break;
    }
    if (listAssetsResult.assets) {
      result.push(...listAssetsResult.assets);
    }
    if (listAssetsResult.next_page_token) {
      pageToken = listAssetsResult.next_page_token;
    }
  }
  return result;
}
