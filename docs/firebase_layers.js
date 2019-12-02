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
};
Object.freeze(LayerType);

const ColorStyle = {
  CONTINUOUS: 0,
  DISCRETE: 1,
  SINGLE: 2,
};
Object.freeze(ColorStyle);

const opacity = 200;

/**
 * Creates the style function for the given properties. Caller should cache to
 * avoid recomputing every time.
 * @param {Object} colorFunctionProperties
 * @return {Function}
 */
function createStyleFunction(colorFunctionProperties) {
  const field = colorFunctionProperties['field'];
  switch (colorFunctionProperties['current-style']) {
    case ColorStyle.SINGLE:
      const color = colorMap.get(colorFunctionProperties['color']);
      return () => color;
    case ColorStyle.CONTINUOUS:
      return createContinuousFunction(
          field, colorFunctionProperties['columns'][field]['min'],
          colorFunctionProperties['columns'][field]['max'],
          colorFunctionProperties['color']);
    case ColorStyle.DISCRETE:
      return createDiscreteFunction(field, colorFunctionProperties['colors']);
  }
}

/**
 * Creates a continuous color function for a feature collection from the given
 * base color to white.
 *
 * @param {String} field property whose value is used to determine color
 * @param {number} minVal minVal of {@param field}
 * @param {number} maxVal maxVal of {@param field}
 * @param {String} color base color
 * @return {Function}
 */
function createContinuousFunction(field, minVal, maxVal, color) {
  const colorRgb = colorMap.get(color);
  const white = colorMap.get('white');
  const range = maxVal - minVal;
  return (feature) => {
    const value = feature['properties'][field];
    const rgba = [];
    for (let i = 0; i < 3; i++) {
      // https://www.alanzucconi.com/2016/01/06/colour-interpolation/
      // Just linear interpolation for now - we can make this smarter.
      rgba.push(
          white[i] + (colorRgb[i] - white[i]) * ((value - minVal) / range));
    }
    rgba.push(opacity);
    return rgba;
  };
}

/**
 * Creates a discrete color function for a feature collection.
 * @param {String} field property whose value is used to determine color
 * @param {Map<String, String>} colors field value:color (e.g. 'minor-damage':
 *     'red')
 * @return {Function}
 */
function createDiscreteFunction(field, colors) {
  console.log(field, colors);
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
