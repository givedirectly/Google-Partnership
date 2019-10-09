export {assets};

/**
 * EarthEngineAsset class to store relevant data about any assets, including
 * special coloring instructions and display name.
 */
class EarthEngineAsset {
  /**
   * Constructor for EarthEngineAsset class.
   *
   * @param {string} type
   * @param {string} displayName
   * @param {boolean} displayOnLoad
   * @param {?Function} colorFunction
   **/
  constructor(type, displayName, displayOnLoad, colorFunction) {
    this.type = type;
    this.displayName = displayName;
    this.displayOnLoad = displayOnLoad;
    this.colorFunction = colorFunction;
  }

  /**
   * Returns whether to display the asset on initial load.
   * @return {boolean}
   */
  shouldDisplayOnLoad() {
    return this.displayOnLoad;
  }

  /**
   * Returns the function to color the asset. Null if asset doesn't
   * need styling or is styled elsewhere.
   *
   * @return {?Function}
   */
  getColorFunction() {
    return this.colorFunction;
  }

  /**
   * Returns the asset type.
   *
   * @return {string} The asset type.
   */
  getType() {
    return this.type;
  }

  /**
   * Return the display name for the asset.
   *
   * @return {string}
   */
  getDisplayName() {
    return this.displayName;
  }
}

/**
 * Color the feature with SVI specific logic.
 *
 * @param {GeoJSON.Feature} feature
 */
function colorSVILayer(feature) {
  const opacity = Math.min(Math.round(255 * feature.properties['SVI']), 255);
  feature.properties['color'] = [255 - opacity, 0, 255 - opacity, opacity];
}

/**
 * Color the feature with Path of Storm Radii specific logic.
 *
 * @param {GeoJSON.Feature} feature
 */
function colorPathofStormRadiiLayer(feature) {
  const opacity =
      Math.min(Math.round(255 * feature.properties['RADII'] / 100), 255);
  feature.properties['color'] =
      [255 - opacity, 255 - opacity, 255 - opacity, 40];
}

// TODO: Store these and allow users to change/set these fields on import page.
const harveyDamgeCrowdAIFormat =
    new EarthEngineAsset('FeatureCollection', 'Harvey Damge CrowdAI', true);
const sviData = new EarthEngineAsset(
    'FeatureCollection', 'SVI Data', false, (feature) => {
      colorSVILayer(feature)
    });
const pathOfStormRadii = new EarthEngineAsset(
    'FeatureCollection', 'Path of Storm Radii', false, (feature) => {
      colorPathofStormRadiiLayer(feature)
    });

// List of known assets
const assets = {
  'users/juliexxia/harvey-damage-crowdai-format': harveyDamgeCrowdAIFormat,
  'users/ruthtalbot/harvey-SVI': sviData,
  'users/ruthtalbot/harvey-pathofstorm-radii': pathOfStormRadii,
};
