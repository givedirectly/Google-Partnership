export {
  colorMap,
  ColorStyle,
  createStyleFunction,
  LayerType,
};

const LayerType = {
  FEATURE: 0,
  FEATURE_COLLECTION: 1,
  IMAGE: 2,
  IMAGE_COLLECTION: 3,
  MAP_TILES: 4,
  KML: 5,
};
Object.freeze(LayerType);

const ColorStyle = {
  CONTINUOUS: 0,
  DISCRETE: 1,
  SINGLE: 2,
};
Object.freeze(ColorStyle);

/**
 * Creates the style function for the given properties. Caller should cache to
 * avoid recomputing every time.
 * @param {Object} colorFunctionProperties
 * @return {Function}
 */
function createStyleFunction(colorFunctionProperties) {
  const field = colorFunctionProperties['field'];
  const opacity = colorFunctionProperties['opacity'];
  switch (colorFunctionProperties['current-style']) {
    case ColorStyle.SINGLE:
      const color = colorMap.get(colorFunctionProperties['color']);
      return () => color;
    case ColorStyle.CONTINUOUS:
      return createContinuousFunction(
          field, opacity, colorFunctionProperties['min'],
          colorFunctionProperties['max'], colorFunctionProperties['color']);
    case ColorStyle.DISCRETE:
      return createDiscreteFunction(
          field, opacity, colorFunctionProperties['colors']);
  }
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
