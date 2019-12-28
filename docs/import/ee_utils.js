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
  let nextPageToken = null;
  const result = [];
  do {
    let assets;
    ({next_page_token: nextPageToken, assets} =
         await ee.data.listAssets(path, {page_token: nextPageToken}, () => {}));
    if (assets) {
      result.push(...assets);
    }
  } while (nextPageToken);
  return result;
}
