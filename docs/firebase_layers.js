export {
  colorMap,
  firebaseLayers,
  getStyleFunction,
  initializeFirebaseLayers,
  LayerType,
};

// The collection of firebase layers.
let firebaseLayers;

/**
 * Initialize the var once we receive the layers from firebase.
 * @param {Object} layers
 */
function initializeFirebaseLayers(layers) {
  firebaseLayers = layers;
}

const LayerType = {
  FEATURE: 0,
  FEATURE_COLLECTION: 1,
  IMAGE: 2,
  IMAGE_COLLECTION: 3,
  MAP_TILES: 4,
};
Object.freeze(LayerType);

// Map of FeatureCollection ee asset path to style function so we don't need to
// recreate it every time.
const styleFunctions = new Map();

/**
 * Returns style function for this FeatureCollection ee asset.
 * @param {String} assetName asset path
 * @return {Function}
 */
function getStyleFunction(assetName) {
  return styleFunctions.has(assetName) ? styleFunctions.get(assetName) :
                                         createStyleFunction(assetName);
}

/**
 * Creates and stores the style function for a FeatureCollection ee asset.
 * @param {String} assetName asset path
 * @return {Function}
 */
function createStyleFunction(assetName) {
  const colorFunctionProperties = firebaseLayers[assetName]['color-function'];
  let styleFunction;
  if (colorFunctionProperties['single-color']) {
    const color = colorMap.get(colorFunctionProperties['single-color']);
    styleFunction = () => color;
  } else {
    const continuous = colorFunctionProperties['continuous'];
    const field = colorFunctionProperties['field'];
    const opacity = colorFunctionProperties['opacity'];
    styleFunction = continuous ?
        createContinuousFunction(
            field, opacity, colorFunctionProperties['min'],
            colorFunctionProperties['max'],
            colorFunctionProperties['base-color']) :
        createDiscreteFunction(
            field, opacity, colorFunctionProperties['colors']);
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
 * @param {number} minVal minVal of {@param field}
 * @param {number} maxVal maxVal of {@param field}
 * @param {String} color base color
 * @return {Function}
 */
function createContinuousFunction(field, opacity, minVal, maxVal, color) {
  const colorRgb = colorMap.get(color);
  const white = colorMap.get('white');
  return (feature) => {
    const value = feature['properties'][field];
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
  ['white', [255, 255, 255]],
]);
