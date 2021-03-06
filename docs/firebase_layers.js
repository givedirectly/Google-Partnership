export {
  colorMap,
  ColorStyle,
  colorToRgbString,
  createStyleFunction,
  getLinearGradient,
  LayerType,
  SOLID_BLACK,
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

const OPACITY = 200;

const SOLID_BLACK = [0, 0, 0];

/**
 * Creates the style function for the given properties. Caller should cache to
 * avoid recomputing every time.
 * @param {Object} colorFunctionProperties
 * @return {Function}
 */
function createStyleFunction(colorFunctionProperties) {
  const field = colorFunctionProperties['field'];
  switch (colorFunctionProperties.currentStyle) {
    case ColorStyle.SINGLE:
      const color = colorMap.get(colorFunctionProperties.color);
      return () => color;
    case ColorStyle.CONTINUOUS:
      return createContinuousFunction(
          field, colorFunctionProperties['columns'][field]['min'],
          colorFunctionProperties['columns'][field]['max'],
          colorFunctionProperties['color']);
    case ColorStyle.DISCRETE:
      return createDiscreteFunction(field, colorFunctionProperties.colors);
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
    rgba.push(OPACITY);
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
    return colorMap.get(colors[value]);
  };
}

const transparent = Object.freeze([0, 0, 0, 0]);

const colorMap = Object.freeze(new Map([
  ['red', Object.freeze([255, 0, 0, OPACITY])],
  ['orange', Object.freeze([255, 140, 0, OPACITY])],
  ['yellow', Object.freeze([255, 255, 0, OPACITY])],
  ['green', Object.freeze([0, 255, 0, OPACITY])],
  ['blue', Object.freeze([0, 0, 255, OPACITY])],
  ['purple', Object.freeze([128, 0, 128, OPACITY])],
  ['black', Object.freeze([0, 0, 0, OPACITY])],
  ['white', Object.freeze([255, 255, 255, OPACITY])],
]));

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
  let gradientString = 'linear-gradient(to right';
  switch (colorFunction.currentStyle) {
    case ColorStyle.CONTINUOUS:
      gradientString +=
          ', rgb(255,255,255), ' + colorToRgbString(colorFunction['color']);
      break;
    case ColorStyle.DISCRETE:
      const colors = [...(new Set(Object.values(colorFunction['colors'])))];
      const percent = 100 / colors.length;
      for (let i = 1; i <= colors.length; i++) {
        const rgb = colorToRgbString(colors[i - 1]);
        gradientString += ', ' + rgb + ' ' + (i * percent - percent) + '%, ' +
            rgb + ' ' + i * percent + '%';
      }
      break;
    case ColorStyle.SINGLE:
      const rgb = colorToRgbString(colorFunction['color']);
      gradientString += ', ' + rgb + ', ' + rgb;
      break;
  }
  return gradientString + ')';
}

/**
 * Converts a color to a css-recognizable rgb string.
 * @param {string} color one of the keys of our colorMap or a hex string
 *     for special cases like the user features color or the score color.
 * @return {string}
 */
function colorToRgbString(color) {
  const rgbArray = colorMap.get(color);
  if (!rgbArray) {
    return color;
  }
  return 'rgb(' + rgbArray[0] + ',' + rgbArray[1] + ',' + rgbArray[2] + ')';
}
