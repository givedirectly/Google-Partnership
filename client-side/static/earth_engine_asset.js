export {assets};

/* EarthEngineAsset class to store relevant data about any assets, including
 * special coloring instructions and display name. */
class EarthEngineAsset {
  constructor(type, displayName, displayOnLoad, visParams, colorFunction) {
    this.type = type;
    this.displayName = displayName;
    this.displayOnLoad = displayOnLoad;
    this.visParams = visParams;
    this.colorFunction = colorFunction;
  }

  /* @return {boolean} Whether to display the asset on initial load. */
  shouldDisplayOnLoad() {
    return this.displayOnLoad;
  }

  /* @return {Function} The function to color the asset. Null if asset doesn't
   * need styling or is styled elsewhere. */
  getColorFunction() {
    return this.colorFunction;
  }

  /* @return {string} The asset type. */
  getType() {
    return this.type;
  }

  /* @return {string} The display name for the asset. */
  getDisplayName() {
    return this.displayName;
  }
}

/* @param {GeoJSON.Feature} feature */
function colorSVILayer(feature) {
  const opacity = Math.min(Math.round(255 * feature.properties['SVI']), 255);
  feature.properties['color'] = [255 - opacity, 0, 255 - opacity, opacity];
}

/* @param {GeoJSON.Feature} feature */
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
    'FeatureCollection', 'SVI Data', false, {},
    (feature) => {colorSVILayer(feature)});
const pathOfStormRadii = new EarthEngineAsset(
    'FeatureCollection', 'Path of Storm Radii', false, {},
    (feature) => {colorPathofStormRadiiLayer(feature)});

// List of known assets
const assets = {
  'users/juliexxia/harvey-damage-crowdai-format': harveyDamgeCrowdAIFormat,
  'users/ruthtalbot/harvey-SVI': sviData,
  'users/ruthtalbot/harvey-pathofstorm-radii': pathOfStormRadii,
};
