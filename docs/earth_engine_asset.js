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
};

// TODO: Store these and allow users to change/set these fields on import page.
const elevationData = new EarthEngineAsset(
    EarthEngineAsset.Type.IMAGE, 'Elevation Data', false, (layer) => {
      const aspect = ee.Terrain.aspect(layer);
      return aspect.divide(180).multiply(Math.PI).sin();
    }, {min: -1, max: 1, opacity: .3});
const noaaData =
    new EarthEngineAsset(EarthEngineAsset.Type.IMAGE, 'NOAA Imagery', false);

// List of known assets we have yet to export to firestore.
const assets = {
  'CGIAR/SRTM90_V4': elevationData,
  'users/janak/processed-noaa-harvey-js-max-pixels-bounded-scale-1': noaaData,
};
