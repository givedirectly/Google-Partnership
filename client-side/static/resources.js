export {disaster, getResources};

/**
 * Gets all the ee assets relevant to the current disaster.
 * @return {DisasterMapValue}
 */
function getResources() {
  return disasters.get(disaster);
}

/** The current disaster. */
const disaster = 'michael';

/** Disaster asset names and other constants. */
const disasters = new Map();

/** Constants for {@code disasters} map. */
class DisasterMapValue {
  /**
   * @param {string} year
   * @param {string} damage ee asset path
   * @param {string} snap ee asset path to snap info
   * @param {string} bg ee asset path to block group info
   * @param {string} income ee asset path to median income info
   * @param {string} svi ee asset path to svi info
   * @param {string} buildings ee asset path to building footprint info
   */
  constructor(year, damage, snap, bg, income, svi, buildings) {
    this.year = year;
    this.damage = damage;
    this.rawSnap = snap;
    this.bg = bg;
    this.income = income;
    this.svi = svi;
    this.buildings = buildings;
  }
}

// TODO: Don't store census/svi data in relation to a disaster so we can handle
// scenarios that are not 1:1 state:disaster e.g. michael which hit both
// florida and georgia.
disasters.set(
    'michael',
    new DisasterMapValue(
        '2018', 'users/gd/michael/FEMA_Damage_Assessments',
        'users/gd/michael/snap', 'users/gd/michael/tiger',
        'users/gd/michael/income', 'users/gd/michael/svi',
        'users/gd/michael/relevant_buildings'));

disasters.set(
    'harvey',
    new DisasterMapValue(
        '2017', 'users/juliexxia/harvey-damage-crowdai-format-deduplicated',
        'users/juliexxia/snap_texas', 'users/juliexxia/tiger_texas',
        'users/juliexxia/income_texas', 'users/ruthtalbot/harvey-SVI',
        'users/juliexxia/harvey-damage-zone-ms-buildings'));
