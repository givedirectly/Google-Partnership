export {assets};

class EarthEngineAsset {
  constructor(type, displayName, displayOnLoad, visParams, colorFunction) {
    this.type = type;
    this.displayName = displayName;
    this.displayOnLoad = displayOnLoad;
    this.visParams = visParams;
    this.colorFunction = colorFunction;
  }

  getAsset(assetPath) {
    // TODO(ruthtalbot): Add support for images
    switch (this.type) {
      case 'FeatureCollection':
        return ee.FeatureCollection(assetPath);
        break;
    }
  }

  shouldDisplayOnLoad() {
    return this.displayOnLoad;
  }

  getColorFunction() {
    return this.colorFunction;
  }

  getType() {
    return this.type;
  }

  getDisplayName() {
    return this.displayName;
  }
}

function colorSVILayer(feature) {
  const opacity = Math.min(Math.round(255 * feature.properties['SVI']), 255);
  feature.properties['color'] = [255 - opacity, 0, 255 - opacity, opacity];
}

function colorPathofStormRadiiLayer(feature) {
  const opacity =
      Math.min(Math.round(255 * feature.properties['RADII'] / 100), 255);
  feature.properties['color'] =
      [255 - opacity, 255 - opacity, 255 - opacity, 40];
}

// TODO: Store these and allow users to change/set these fields on import page.
const harveyDamgeCrowdAIFormat =
    new EarthEngineAsset('FeatureCollection', 'Harvey Damge CrowdAI', true);
// TODO(ruthtalbot): support images and add this back into asset list.
const elevationData = new EarthEngineAsset(
    'Image', 'Elevation Data', false, {min: -1, max: 1, opacity: .25},
    (layer) => {
      var aspect = ee.Terrain.aspect(layer);
      return aspect.divide(180).multiply(Math.PI).sin();
    });
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