import {inProduction} from './in_test_util.js';

export {getDisaster, getResources};

/**
 * Gets all the ee assets relevant to the current disaster.
 * @return {DisasterMapValue}
 */
function getResources() {
  return disasters.get(disaster);
}

/**
 * Always use Harvey for test cases since our tests assert against specific
 * block groups and damage points.
 * @return {string} current disaster
 */
function getDisaster() {
  return inProduction() ? disaster : 'harvey';
}

/** The current disaster. */
const disaster = 'harvey';

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
    'harvey',
    new DisasterMapValue(
        'harvey', 2017, 'users/gd/harvey/FEMA_Damage_Assessments',
        'users/gd/harvey/snap', 'users/gd/harvey/tiger',
        'users/gd/harvey/income', 'users/gd/harvey/svi',
        'users/gd/harvey/buildings'));
