import damageLevelsList from './damage_levels.js';

export {importData as default};

/** Harvey */
const damageKey = 'DMG_LEVEL';
const damageAsset = 'users/janak/FEMA_Damage_Assessments_Harvey_20170829';
const rawSnapAsset = 'users/janak/texas-snap';
const buildingsAsset = 'users/janak/census_building_data';
const censusSnapKey = 'ACS_16_5_4';
const censusTotalKey = 'ACS_16_5_2';
const censusBuildingKeyPrefix = 'HD01_VD';

/**
 * Export a full-properties feature collection for hurrican harvey. This differs
 * from the current set up because it uses FEMA damage data and census data for
 * building counts.
 */
function importData() {
  const damage = ee.FeatureCollection(damageAsset);
  const rawSnap =
      ee.FeatureCollection(rawSnapAsset).filterBounds(damage.geometry());
  const buildings = ee.FeatureCollection(buildingsAsset);

  const processedBuildings = buildings.map(countBuildings);
  const joinedSnap = ee.Join.inner().apply(
      rawSnap, processedBuildings,
      ee.Filter.equals({leftField: 'GEOID', rightField: 'GEOID'}));
  const task = ee.batch.Export.table.toAsset(
      joinedSnap.map(countDamage), 'texas-snap-join-damage',
      'users/janak/texas-snap-join-damage');
  task.start();
  $('.upload-status')
      .text('Check Code Editor console for progress. Task: ' + task.id);
  joinedSnap.size().evaluate(function(val, failure) {
    if (val) {
      $('.upload-status').append('\n<p>Found ' + val + ' elements');
    } else {
      $('.upload-status').append('\n<p>Error getting size: ' + failure);
    }
  });
}

/**
 * Counts the number of damaged buildings within the boundaries of the given
 * feature, categorized by type of damage.
 *
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function countDamage(feature) {
  const damage = ee.FeatureCollection(damageAsset);
  const damageLevels = ee.List(damageLevelsList);
  const damageFilters =
      damageLevels.map((type) => ee.Filter.eq(damageKey, type));

  const mainFeature = ee.Feature(feature.get('primary'));
  // TODO(janakr): #geometry() is deprecated?
  const geometry = mainFeature.geometry();
  const blockDamage = damage.filterBounds(geometry);
  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map((type) => blockDamage.filter(type).size()));
  return ee.Feature(
      geometry,
      attrDict.set('GEOID', mainFeature.get('GEOID'))
          .set('SNAP', mainFeature.get(censusSnapKey))
          .set('TOTAL', mainFeature.get(censusTotalKey))
          .set(
              'BUILDING_COUNT',
              ee.Feature(feature.get('secondary')).get('BUILDING_COUNT')));
}

/**
 * Count the total number of buildings in the given feature, which comes from a
 * Census table that partitions buildings by types.
 *
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function countBuildings(feature) {
  let totalBuildings = ee.Number(0);
  // Columns in Census data. HD01_VD{i} is the number of buildings in category
  // i, where category 1 is single homes, category 2 is attached, etc. See
  // Census table B25024 for details.
  for (let i = 1; i <= 11; i++) {
    totalBuildings = totalBuildings.add(
        feature.get(censusBuildingKeyPrefix + padToTwoDigits(i)));
  }
  return ee.Feature(feature.geometry(), ee.Dictionary([
    // TODO(#22): when we're processing data from scratch, this won't be a
    // string on the other side, so we can leave it as is here.
    'GEOID',
    ee.String(feature.get('GEOid2')),
    'BUILDING_COUNT',
    totalBuildings,
  ]));
}

/**
 * Pads a 1- or 2-digit number to 2 digits. Only valid for 0 <= 0 < 100.
 *
 * @param {number} i
 * @return {string}
 */
function padToTwoDigits(i) {
  return i < 10 ? '0' + i : i;
}
