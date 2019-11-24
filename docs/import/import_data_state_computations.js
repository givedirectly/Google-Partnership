import {tigerGeoidKey} from './import_data_keys.js';
export {getStateBlockGroupsFromNationalBlocks};

// TODO(janakr): this step is unacceptably slow for Texas, at least. Without it,
//  full processing takes ~30 minutes, but with it, it times out. Figure out if
//  it can be optimized enough to be used, or if GD will just have to upload
//  TIGER Shapefiles indefinitely.
/**
 * Merges Census blocks into Census block groups, localized to the current state
 * (in a multi-state disaster, the given {@code censusblocks} may span multiple
 * states). Does so by constructing the block group id and appending it to each
 * block, then selecting a representative block from each group. We then join
 * that resulting collection with the original, using a "saveAll" join so that
 * every block with that group id is attached to the same feature. We then merge
 * all the geometries of those blocks, resulting in the block group geometry.
 *
 * The geometry thus constructed has a few issues. First, due to limited
 * accuracy, EarthEngine will occasionally carve a few microscopic holes in the
 * resulting region, where it didn't notice that the block boundaries lined up
 * exactly. We strip out all holes. Second, block group boundaries actually
 * change from year to year (usually by miniscule amounts). Since our Census
 * blocks are from the main Census (because that's what EarthEngine provides),
 * there are some small discrepancies between the constructed geometry and the
 * latest available block group data. Third, the resulting geometry can be more
 * "complex" than the standard block group geometry, because it, for instance,
 * could have three points in a straight line. That could be simplified to just
 * the two endpoints, but doesn't seem worth it.
 *
 * @param {ee.FeatureCollection} censusBlocks Should already be restricted to a
 *     limited area to minimize calculations
 * @param {string} state Two-letter abbreviation for affected state
 * @param {string} censusStateKey Property under which Census state FIPS code is
 *     found in {@code censusBlocks}. Currently 'statefp10'
 * @param {string} censusBlockIdKey See {@link computeGeoIdFromFeature}
 * @param {string} censusBlockOnlyKey See {@link computeGeoIdFromFeature}
 * @return {ee.FeatureCollection}
 */
function getStateBlockGroupsFromNationalBlocks(
    censusBlocks, state, censusStateKey, censusBlockIdKey, censusBlockOnlyKey) {
  const stateBlocksWithGeoId =
      censusBlocks.filter(ee.Filter.eq(censusStateKey, fipsMap.get(state)))
          .map((f) => addGeoIdToBlock(f, censusBlockIdKey, censusBlockOnlyKey));
  const perBlockGroup = stateBlocksWithGeoId.distinct(tigerGeoidKey);
  const groupedByBlockGroup =
      ee.Join.saveAll('features')
          .apply(
              perBlockGroup, stateBlocksWithGeoId,
              ee.Filter.equals(
                  {leftField: tigerGeoidKey, rightField: tigerGeoidKey}));
  return groupedByBlockGroup.map((feature) => {
    const mergedGeometry =
        ee.FeatureCollection(ee.List(feature.get('features'))).geometry();
    // Create a new geometry with just the first list of coordinates (the outer
    // ring). Holes come from EarthEngine fuzziness and (maybe?) gaps between
    // Census blocks that are filled in groups.
    return ee.Feature(
        ee.Geometry.Polygon(mergedGeometry.coordinates().get(0)),
        ee.Dictionary().set(tigerGeoidKey, feature.get(tigerGeoidKey)));
  });
}

/**
 * Computes the block group geoid from the given Census block. The block id
 * without all but the first character of the block tabulation number is the
 * block group id
 * @param {ee.Feature} feature Census block
 * @param {string} idKey property of Census block id ('blockid10')
 * @param {string} blockOnlyKey property of Census block tabulation number
 *     ('blockce')
 * @return {string} Block group geoid
 */
function computeGeoIdFromFeature(feature, idKey, blockOnlyKey) {
  return ee.String(feature.get(idKey))
      .slice(
          ee.Number(0),
          // Index is negative, indicating count back from end of string.
          ee.Number(1).subtract(ee.String(feature.get(blockOnlyKey)).length()));
}

/**
 * Adds the block group geoid to the given block under the {@link tigerGeoidKey}
 * field. See {@link computeGeoIdFromFeature} for the computation method.
 * @param {ee.Feature} feature Census block
 * @param {string} idKey property of Census block id ('blockid10')
 * @param {string} blockOnlyKey property of Census block tabulation number
 *     ('blockce')
 * @return {ee.Feature} Modified feature
 */
function addGeoIdToBlock(feature, idKey, blockOnlyKey) {
  return feature.set(
      tigerGeoidKey, computeGeoIdFromFeature(feature, idKey, blockOnlyKey));
}

// https://www.nrcs.usda.gov/wps/portal/nrcs/detail/?cid=nrcs143_013696
// Use strings because that's what EE thinks FIPS code column is.
const fipsMap = new Map([
  ['AL', '1'],  ['AK', '2'],  ['AZ', '4'],  ['AR', '5'],  ['CA', '6'],
  ['CO', '8'],  ['CT', '9'],  ['DE', '10'], ['FL', '12'], ['GA', '13'],
  ['HI', '15'], ['ID', '16'], ['IL', '17'], ['IN', '18'], ['IA', '19'],
  ['KS', '20'], ['KY', '21'], ['LA', '22'], ['ME', '23'], ['MD', '24'],
  ['MA', '25'], ['MI', '26'], ['MN', '27'], ['MS', '28'], ['MO', '29'],
  ['MT', '30'], ['NE', '31'], ['NV', '32'], ['NH', '33'], ['NJ', '34'],
  ['NM', '35'], ['NY', '36'], ['NC', '37'], ['ND', '38'], ['OH', '39'],
  ['OK', '40'], ['OR', '41'], ['PA', '42'], ['RI', '44'], ['SC', '45'],
  ['SD', '46'], ['TN', '47'], ['TX', '48'], ['UT', '49'], ['VT', '50'],
  ['VA', '51'], ['WA', '53'], ['WV', '54'], ['WI', '55'], ['WY', '56'],
  ['AS', '60'], ['GU', '66'], ['MP', '69'], ['PR', '72'], ['VI', '78'],
]);
