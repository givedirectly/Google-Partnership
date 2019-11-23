import {ColorStyle} from '../firebase_layers.js';

import {ILLEGAL_STATE_ERR, setStatus} from './add_disaster_util.js';

export {withColor};

/**
 * Adds color function info to the given td.
 * @param {JQuery<HTMLElement>} td
 * @param {Object} layer
 * @param {string} property
 * @param {number} index
 * @return {JQuery<HTMLElement>}
 */
function withColor(td, layer, property, index) {
  const colorFunction = layer[property];
  if (!colorFunction) {
    return td.text('N/A').addClass('na');
  }
  switch (colorFunction['current-style']) {
    case ColorStyle.SINGLE:
      td.append(createColorBox(colorFunction['color']));
      break;
    case ColorStyle.CONTINUOUS:
      td.append(createColorBox(colorFunction['color']));
      break;
    case ColorStyle.DISCRETE:
      const colorObject = colorFunction['colors'];
      const colorSet = new Set();
      Object.keys(colorObject).forEach((propertyValue) => {
        const color = colorObject[propertyValue];
        if (!colorSet.has(color)) {
          colorSet.add(color);
          td.append(createColorBox(colorObject[propertyValue]));
        }
      });
      break;
    default:
      setStatus(ILLEGAL_STATE_ERR + 'unrecognized color function: ' + layer);
  }
  return td;
}

/**
 * Creates an instance of the color boxes for the color col.
 * @param {string} color what color to make the box.
 * @return {JQuery<HTMLDivElement>}
 */
function createColorBox(color) {
  return $(document.createElement('div'))
      .addClass('box')
      .css('background-color', color);
}
