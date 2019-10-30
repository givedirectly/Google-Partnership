import {cdcSviKey} from './import/import_data_keys.js';

export {assets, EarthEngineAsset};

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
   * @param {?Function} stylingFunction
   * @param {Object} visParams
   **/
  constructor(type, displayName, displayOnLoad, stylingFunction, visParams) {
    this.type = type;
    this.displayName = displayName;
    this.displayOnLoad = displayOnLoad;
    this.stylingFunction = stylingFunction;
    this.visParams = visParams;
  }

  /**
   * Returns whether to display the asset on initial load.
   * @return {boolean}
   */
  shouldDisplayOnLoad() {
    return this.displayOnLoad;
  }

  /**
   * Returns the function to style the asset. Null if asset doesn't
   * need styling or is styled elsewhere.
   *
   * @return {?Function}
   */
  getStylingFunction() {
    return this.stylingFunction;
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

  /**
   * Returns the visual styling for the asset, if any.
   *
   * @return {Object}
   */
  getVisParams() {
    return this.visParams;
  }
}

EarthEngineAsset.Type = {
  IMAGE: 'Image',
  IMAGECOLLECTION: 'ImageCollection',
  FEATURECOLLECTION: 'FeatureCollection',
};


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
  const publicAssistance = feature.properties['Designatio'] == 'PA';
  return publicAssistance ? [255, 255, 51, 40] : [220, 20, 60, 40];
}

/**
 * Colors the feature with GD Assistance-specific logic.
 *
 * @param {GeoJSON.Feature} feature
 * @return {Array} color RGBA color specification as an array
 */
function colorGDAssistanceLayer(feature) {
  return [255, 255, 102, 100];
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
    EarthEngineAsset.Type.FEATURECOLLECTION, 'Harvey Damge CrowdAI', true,
    colorDamageLayer);
const sviData = new EarthEngineAsset(
    EarthEngineAsset.Type.FEATURECOLLECTION, 'SVI Data', false, colorSVILayer);
const pathOfStormRadii = new EarthEngineAsset(
    EarthEngineAsset.Type.FEATURECOLLECTION, 'Path of Storm Radii', false,
    colorPathofStormRadiiLayer);
const femaVisits = new EarthEngineAsset(
    EarthEngineAsset.Type.FEATURECOLLECTION, 'FEMA Assistance', false,
    colorFemaAssistanceLayer);
const elevationData = new EarthEngineAsset(
    EarthEngineAsset.Type.IMAGE, 'Elevation Data', false, (layer) => {
      const aspect = ee.Terrain.aspect(layer);
      return aspect.divide(180).multiply(Math.PI).sin();
    }, {min: -1, max: 1, opacity: .3});
const noaaData =
    new EarthEngineAsset(EarthEngineAsset.Type.IMAGE, 'NOAA Imagery', false);
const gdVisits = new EarthEngineAsset(
    'FeatureCollection', 'GD Assistance', false, colorGDAssistanceLayer);

// List of known assets. Display priority is determined by order in this list,
// with higher index assets being displayed above lower index assets, except for
// Images/ImageCollections, which will always be displayed below
// FeatureCollections.
const assets = {
  'users/juliexxia/harvey-damage-crowdai-format-deduplicated':
      harveyDamageCrowdAIFormat,
  'users/gd/harvey/svi': sviData,
  'users/ruthtalbot/harvey-pathofstorm-radii': pathOfStormRadii,
  'users/ruthtalbot/fema-visits-polygon': femaVisits,
  'CGIAR/SRTM90_V4': elevationData,
  'users/janak/processed-noaa-harvey-js-max-pixels-bounded-scale-1': noaaData,
  'users/ruthtalbot/gd-polygons-harvey': gdVisits,
};
