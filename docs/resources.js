import {inProduction} from './in_test_util.js';
import {gdEePathPrefix} from './ee_paths.js';

export {getDisaster, getResources};

/**
 * Gets all the ee assets relevant to the current disaster.
 * @return {DisasterMapValue}
 */
function getResources() {
  return disasters.get(getDisaster());
}

/**
 * Always use Harvey for test cases since our tests assert against specific
 * block groups and damage points.
 * @return {string} current disaster
 */
function getDisaster() {
  return inProduction() ? disaster : '2017-harvey';
}

/** The current disaster. */
const disaster = '2017-harvey';

/** Disaster asset names and other constants. */
const disasters = new Map();

/** Constants for {@code disasters} map. */
class DisasterMapValue {
  /**
   * @constructor
   * @param {string} name (includes year)
   * @param {string} damage ee asset path
   * @param {string} snap ee asset path to snap info
   * @param {string} bg ee asset path to block group info
   * @param {string} income ee asset path to median income info
   * @param {string} svi ee asset path to svi info
   * @param {string} buildings ee asset path to building footprint info
   */
  constructor(name, damage, snap, bg, income, svi, buildings) {
    this.name = name;
    this.damage = damage;
    this.rawSnap = snap;
    this.bg = bg;
    this.income = income;
    this.svi = svi;
    this.buildings = buildings;
  }

  /** @return {string} The combined SNAP/damage asset name */
  getCombinedAsset() {
    return gdEePathPrefix + this.name + '/data-ms-as-nod';
  }
}

const michaelName = '2018-michael';
const michaelPathPrefix = gdEePathPrefix + michaelName + '/';

const harveyName = '2018-harvey';
const harveyPathPrefix = gdEePathPrefix + harveyName + '/';

// TODO: Don't store census/svi data in relation to a disaster so we can handle
// scenarios that are not 1:1 state:disaster e.g. michael which hit both
// florida and georgia.
disasters.set(
    michaelName,
    new DisasterMapValue(michaelName, michaelPathPrefix + 'FEMA_Damage_Assessments',
        michaelPathPrefix + 'snap', michaelPathPrefix + 'tiger',
        michaelPathPrefix + 'income', michaelPathPrefix + 'svi',
        michaelPathPrefix + 'relevant_buildings'));

disasters.set(
    harveyName,
    new DisasterMapValue(harveyName, harveyPathPrefix + 'FEMA_Damage_Assessments',
        harveyPathPrefix + 'snap', harveyPathPrefix + 'tiger',
        harveyPathPrefix + 'income', harveyPathPrefix + 'svi',
        harveyPathPrefix + 'buildings'));
