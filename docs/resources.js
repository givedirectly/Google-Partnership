import {inProduction} from './in_test_util.js';

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
   * @param {string} name
   * @param {number} year
   * @param {string} damage ee asset path
   * @param {string} snap ee asset path to snap info
   * @param {string} bg ee asset path to block group info
   * @param {string} income ee asset path to median income info
   * @param {string} svi ee asset path to svi info
   * @param {string} buildings ee asset path to building footprint info
   */
  constructor(name, year, damage, snap, bg, income, svi, buildings) {
    this.year = year;
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
    return 'users/gd/' + this.name + '/data-ms-as-nod';
  }
}

// TODO: Don't store census/svi data in relation to a disaster so we can handle
// scenarios that are not 1:1 state:disaster e.g. michael which hit both
// florida and georgia.
disasters.set(
    'michael',
    new DisasterMapValue(
        'michael', 2018, 'users/gd/michael/FEMA_Damage_Assessments',
        'users/gd/michael/snap', 'users/gd/michael/tiger',
        'users/gd/michael/income', 'users/gd/michael/svi',
        'users/gd/michael/relevant_buildings'));

disasters.set(
    '2017-harvey',
    new DisasterMapValue(
        '2017-harvey', 2017, 'users/gd/2017-harvey/FEMA_Damage_Assessments',
        'users/gd/2017-harvey/snap', 'users/gd/2017-harvey/tiger',
        'users/gd/2017-harvey/income', 'users/gd/2017-harvey/svi',
        'users/gd/2017-harvey/buildings'));
