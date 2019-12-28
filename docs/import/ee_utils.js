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
async function listEeAssets(path) {
  let listAssetsResult = null;
  const result = [];
  // Loop while either we are on first iteration or have a page token.
  while (listAssetsResult === null || listAssetsResult.next_page_token) {
    listAssetsResult = await ee.data.listAssets(
        path,
        listAssetsResult && listAssetsResult.next_page_token ?
            {page_token: listAssetsResult.next_page_token} :
            {},
        () => {});
    if (!listAssetsResult) {
      break;
    }
    if (listAssetsResult.assets) {
      result.push(...listAssetsResult.assets);
    }
  }
  return result;
}
