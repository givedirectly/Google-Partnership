export {
  colorMap,
  ColorStyle,
  createStyleFunction,
  getLinearGradient,
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
    let value = feature['properties'][field];
    if (value === null) return transparent;
    if (value > maxVal) {
      value = maxVal;
    } else if (value < minVal) {
      value = minVal;
    }
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
  return (feature) => {
    const value = feature['properties'][field];
    if (value === null) return transparent;
    const rgba = colorMap.get(colors[value]);
    rgba.push(opacity);
    return rgba;
  };
}

const transparent = [0, 0, 0, 0];

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

/**
 * Gets the linear gradient of the colors for the legend.
 *
 * @param {Object} colorFunction color data from the layer
 * @return {string} the linear gradient
 */
function getLinearGradient(colorFunction) {
  if (!colorFunction) {
    return '';
  }
  const currentStyle = colorFunction['current-style'];
  let gradientString = 'linear-gradient(to right';
  switch (currentStyle) {
    case 0:
      gradientString += ', white, ' + colorFunction['color'];
      break;
    case 1:
      const colors = [...(new Set(Object.values(colorFunction['colors'])))];
      const percent = 100 / colors.length;
      for (let i = 1; i <= colors.length; i++) {
        gradientString += ', ' + colors[i - 1] + ' ' + (i * percent - percent) +
            '%, ' + colors[i - 1] + ' ' + i * percent + '%';
      }
      break;
    case 2:
      gradientString +=
          ', ' + colorFunction['color'] + ', ' + colorFunction['color'];
      break;
  }
  return gradientString + ')';
}
