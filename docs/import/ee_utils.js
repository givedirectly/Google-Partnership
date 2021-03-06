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
 *     `projects/earthengine-legacy/assets/` prefix. This comes directly from
 *     the result of {@link ee.data.listAssets}, although it is undocumented
 */
async function listEeAssets(path) {
  let nextPageToken = null;
  const result = [];
  do {
    let assets;
    const listResult =
        await ee.data.listAssets(path, {page_token: nextPageToken}, () => {});
    if (!listResult) {
      // Might only happen in tests?
      break;
    }
    ({next_page_token: nextPageToken, assets} = listResult);
    if (assets) {
      result.push(...assets);
    }
  } while (nextPageToken);
  return result;
}
