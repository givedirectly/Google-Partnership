import {gdEePathPrefix} from './ee_paths.js';

export {getDisaster, getDisasters, getResources};

/**
 * Gets all the ee assets relevant to the current disaster.
 * @return {DisasterMapValue}
 */
function getResources() {
  return disasters.get(getDisaster());
}

/**
 * Determines and returns the current disaster.
 * @return {string} current disaster
 */
function getDisaster() {
  let final_disaster;

  // The order of precedence for determining the current disaster is query
  // parameter, local storage, a test specific default and finally the base
  // default.
  const params = new URLSearchParams(window.location.search);
  if (params.has('disaster')) {
    final_disaster = params.get('disaster');
  } else if (localStorage.getItem('disaster')) {
    final_disaster = localStorage.getItem('disaster');
  } else {
    final_disaster = default_disaster;
  }

  localStorage.setItem('disaster', final_disaster);

  return final_disaster;
}

/**
 * Gets all available disasters.
 * @return {string[]} list of available disasters
 */
function getDisasters() {
  const disasterNames = [];
  for (const disasterName of disasters.keys()) disasterNames.push(disasterName);
  return disasterNames;
}

/** The default disaster. */
const default_disaster = '2017-harvey';

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

// TODO(janakr): get all the data below here from Firestore instead of hard-
//  coding here. That will also need to support multiple states per disaster.
const michaelName = '2018-michael';
const michaelPathPrefix = gdEePathPrefix + michaelName + '/';

const harveyName = '2017-harvey';
const harveyPathPrefix = gdEePathPrefix + harveyName + '/';

disasters.set(
    michaelName,
    new DisasterMapValue(
        michaelName, michaelPathPrefix + 'FEMA_Damage_Assessments',
        michaelPathPrefix + 'snap', michaelPathPrefix + 'tiger',
        michaelPathPrefix + 'income', michaelPathPrefix + 'svi',
        michaelPathPrefix + 'relevant_buildings'));

disasters.set(
    harveyName,
    new DisasterMapValue(
        harveyName, harveyPathPrefix + 'FEMA_Damage_Assessments',
        harveyPathPrefix + 'snap', harveyPathPrefix + 'tiger',
        harveyPathPrefix + 'income', harveyPathPrefix + 'svi',
        harveyPathPrefix + 'buildings'));
