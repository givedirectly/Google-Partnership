export {getResources as default};

/**
 * Gets all the ee assets relevant to the current disaster.
 * @return {DisasterMapValue}
 */
function getResources() {
  return disasters.get(disaster);
}

/** The current disaster. */
const disaster = 'harvey';

/** Disaster asset names and other constants. */
const disasters = new Map();

/** Constants for {@code disasters} map. */
class DisasterMapValue {
  /**
   * @param {string} damageAsset ee asset path
   * @param {string} snapAsset ee asset path to snap info
   * @param {string} bgAsset ee asset path to block group info
   * @param {string} incomeAsset ee asset path to median income info
   * @param {string} sviAsset ee asset path to svi info
   */
  constructor(damageAsset, snapAsset, bgAsset, incomeAsset, sviAsset) {
    this.damageAsset = damageAsset;
    this.rawSnapAsset = snapAsset;
    this.bgAsset = bgAsset;
    this.incomeAsset = incomeAsset;
    this.sviAsset = sviAsset;
  }
}

// TODO: upload michael income and SVI data
disasters.set(
    'michael',
    new DisasterMapValue(
        'users/juliexxia/crowd_ai_michael', 'users/juliexxia/florida_snap',
        'users/juliexxia/tiger_florida'));

disasters.set(
    'harvey',
    new DisasterMapValue(
        'users/juliexxia/harvey-damage-crowdai-format-aff-as-nod',
        'users/juliexxia/snap_texas', 'users/juliexxia/tiger_texas',
        'users/juliexxia/income_texas', 'users/ruthtalbot/harvey-SVI'));
