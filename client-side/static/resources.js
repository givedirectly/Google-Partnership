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
   * @param {string} damage ee asset path
   * @param {string} snap ee asset path to snap info
   * @param {string} bg ee asset path to block group info
   * @param {string} income ee asset path to median income info
   * @param {string} svi ee asset path to svi info
   * @param {string} buildings ee asset path to building footprint info
   */
  constructor(damage, snap, bg, income, svi, buildings) {
    this.damage = damage;
    this.rawSnap = snap;
    this.bg = bg;
    this.income = income;
    this.svi = svi;
    this.buildings = buildings;
  }
}

// TODO: upload michael income, SVI, buildings data
disasters.set(
    'michael',
    new DisasterMapValue(
        'users/gd/michael/FEMA_Damage_Assessments', 'users/gd/michael/snap',
        'users/gd/michael/tiger', 'users/gd/michael/income',
        'users/gd/michael/svi', 'users/gd/michael/relevant_buildings'));

disasters.set(
    'harvey',
    new DisasterMapValue(
        'users/juliexxia/harvey-damage-crowdai-format-deduplicated',
        'users/juliexxia/snap_texas', 'users/juliexxia/tiger_texas',
        'users/juliexxia/income_texas', 'users/ruthtalbot/harvey-SVI',
        'users/juliexxia/harvey-damage-zone-ms-buildings'));
