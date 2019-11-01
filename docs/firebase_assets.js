export {firebaseAssets, initializeFirebaseAssets, getStyleFunction, colorMap};

// The collection of firebase assets.
let firebaseAssets;

/**
 * Initialize the var once we receive the assets from firebase.
 * @param {Object} assets
 */
function initializeFirebaseAssets(assets) {
  firebaseAssets = assets;
}

// Map of FeatureCollection asset path to style function so we don't need to
// recreate it every time.
const styleFunctions = new Map();

/**
 * Return style function for this asset.
 * @param {String} assetName asset path
 * @return {Function}
 */
function getStyleFunction(assetName) {
  return styleFunctions.has(assetName) ? styleFunctions.get(assetName) : createStyleFunction(assetName);
}

/**
 * Creates and stores the style function for an asset.
 * @param {String} assetName asset path
 * @return {Function}
 */
function createStyleFunction(assetName) {
  const colorFxnProperties = firebaseAssets[assetName]['color-fxn'];
  let styleFunction;
  if (colorFxnProperties['single-color']) {
    styleFunction = () => colorMap.get(colorFxnProperties['single-color']);
  } else {
    const continuous = colorFxnProperties['continuous'];
    const field = colorFxnProperties['field'];
    const opacity = colorFxnProperties['opacity'];
    styleFunction = continuous ?
        createContinuousFunction(
            field, opacity, colorFxnProperties['min'],
            colorFxnProperties['max'], colorFxnProperties['base-color']) :
        createDiscreteFunction(field, opacity, colorFxnProperties['colors']);
  }
  styleFunctions.set(assetName, styleFunction);
  return styleFunction;
}

/**
 * Creates a continuous color function for a feature collection from the given
 * base color to white.
 *
 * @param {String} field property whose value is used to determine color
 * @param {number} opacity
 * @param {number} minVal minVal of {@code field}
 * @param {number} maxVal maxVal of {@code field}
 * @param {String} color base color
 * @return {Function}
 */
function createContinuousFunction(field, opacity, minVal, maxVal, color) {
  return (feature) => {
    const value = feature['properties'][field];
    const colorRgb = colorMap.get(color);
    const rgba = [];
    for (let i = 0; i < 3; i++) {
      rgba.push(
          ((colorRgb[i] * (value - minVal)) + (white[i] * (maxVal - value))) /
          2);
    }
    rgba.push(opacity);
    return rgba;
  };
}

/**
 * Creates a discrete color function for a feature collection.
 * @param {String} field property whose value is used to determine color
 * @param {number} opacity
 * @param {Map<String, String>} colors field value:color (e.g. 'minor-damage':
 *     'red')
 * @return {Function}
 */
function createDiscreteFunction(field, opacity, colors) {
  // TODO: allow for a default color if field value color isn't specified.
  return (feature) => {
    const color = colors[feature['properties'][field]];
    const rgba = colorMap.get(color);
    rgba.push(opacity);
    return rgba;
  };
}

const colorMap = new Map([
  ['red', [255, 0, 0]],
  ['orange', [255, 140, 0]],
  ['yellow', [255, 255, 0]],
  ['green', [0, 255, 0]],
  ['blue', [0, 0, 255]],
  ['purple', [128, 0, 128]],
  ['black', [0, 0, 0]],
]);

const white = [255, 255, 255];
