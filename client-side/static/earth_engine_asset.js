export {assets};

/**
 * EarthEngineAsset class to store relevant data about any assets, including
 * special coloring instructions and display name. Doesn't store assetPath,
 * as this is used as the key in the list of assets.
 */
class EarthEngineAsset {
  /**
   * Constructor for EarthEngineAsset class.
   *
   * @param {String} type
   * @param {String} displayName
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
   * @return {String} The asset type.
   */
  getType() {
    return this.type;
  }

  /**
   * Returns the display name for the asset.
   *
   * @return {String}
   */
  getDisplayName() {
    return this.displayName;
  }
}

/**
 * Colors the feature with SVI-specific logic.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} color RGBA color specification as an array
 */
function colorSVILayer(feature) {
  const color = Math.min(Math.round(255 * feature.properties['SVI']), 255);
  return [255 - color, 0, 255 - color, color];
}

/**
 * Colors the feature with Path of Storm Radii-specific logic.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} color RGBA color specification as an array
 */
function colorPathofStormRadiiLayer(feature) {
  const color =
      Math.min(Math.round(255 * feature.properties['RADII'] / 100), 255);
  return [255 - color, 255 - color, 255 - color, 40];
}

/**
 * Colors the feature with FEMA Assistance-specific logic.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} color RGBA color specification as an array
 */
function colorFemaAssistanceLayer(feature) {
  // Color 'public assistance' as yellow, and 'individual and public assistance'
  // as red.
  return (feature.properties['Designatio'] == 'PA') ? [255, 255, 51, 40] :
    [220, 20, 60, 40];
}

/**
 * Colors the feature with damage-specific logic.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} color RGBA color specification as an array
 */
function colorDamageLayer(feature) {
  switch (feature.properties['descriptio']) {
    case 'major-damage':
      return [255, 0, 0, 200];
    case 'minor-damage':
      return [255, 165, 0, 200];
  }
}

// TODO: Store these and allow users to change/set these fields on import page.
const harveyDamageCrowdAIFormat = new EarthEngineAsset(
    'FeatureCollection', 'Harvey Damge CrowdAI', true, colorDamageLayer);
const sviData =
    new EarthEngineAsset('FeatureCollection', 'SVI Data', false, colorSVILayer);
const pathOfStormRadii = new EarthEngineAsset(
    'FeatureCollection', 'Path of Storm Radii', false,
    colorPathofStormRadiiLayer);
const femaVisits = new EarthEngineAsset(
    'FeatureCollection', 'FEMA Assistance', false, colorFemaAssistanceLayer);

// List of known assets
const assets = {
  'users/juliexxia/harvey-damage-crowdai-format': harveyDamageCrowdAIFormat,
  'users/ruthtalbot/harvey-SVI': sviData,
  'users/ruthtalbot/harvey-pathofstorm-radii': pathOfStormRadii,
  'users/ruthtalbot/fema-visits-polygon': femaVisits,
};
