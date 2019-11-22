import {ColorFunctionType, colorMap} from '../firebase_layers.js';
import {onUpdate, getRowIndex, getCurrentLayers, updateLayersInFirestore} from './add_disaster_util.js';

export {populateColorFunctions, withColor};

let globalTd;

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

function populateColorFunctions() {
  const colorFunctionDiv = $('#color-fxn-editor');
  colorFunctionDiv.prepend(createRadioFor('single-color'));
  colorFunctionDiv.prepend(createRadioFor('discrete'));
  colorFunctionDiv.prepend(createRadioFor('continuous'));

  const singleColorPicker = createColorPicker('single-color-picker');
  singleColorPicker.on('change', (event) => singleColorOnChange($(event.item)));
  $('#single').append(createLabelFor(singleColorPicker, 'color: '), singleColorPicker);

  const continuousPicker = createColorPicker('continuous-picker');
  continuousPicker.on('change', (event) => continousOnChange($(event.item)));

}

function singleColorOnChange(picker) {
  const index = getRowIndex(globalTd.parents('tr'));
  getCurrentLayers()[index]['color-function']['single-color'] = picker.val();
  updateLayersInFirestore();
  globalTd.empty();
  globalTd.append(createColorBox(picker.val()));
}

function createLabelFor(element, text) {
  return $(document.createElement('label'))
      .prop('for', element.prop('id'))
      .text(text);
}

function createColorPicker(id) {
  const colorPicker = $(document.createElement('select'));
  colorMap.forEach((value, key) => {
    const option = $(document.createElement('option')).val(key).text(key);
    colorPicker.append(option);
  });
  return colorPicker.prop('id', id);
}

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
  let type = ColorFunctionType.NONE;
  if (!colorFunction) {
    td.text('N/A').addClass('na');
  } else if (colorFunction['single-color']) {
    td.append(createColorBox(colorFunction['single-color']));
    type = ColorFunctionType.SINGLE;
  } else if (colorFunction['base-color']) {
    td.append(createColorBox(colorFunction['base-color']));
    type = ColorFunctionType.CONTINUOUS;
  } else if (colorFunction['colors']) {
    type = ColorFunctionType.DISCRETE;
    const colorObject = colorFunction['colors'];
    const colorSet = new Set();
    Object.keys(colorObject).forEach((propertyValue) => {
      const color = colorObject[propertyValue];
      if (!colorSet.has(color)) {
        colorSet.add(color);
        td.append(createColorBox(colorObject[propertyValue]));
      }
    });
  } else {
    setStatus(ILLEGAL_STATE_ERR + 'unrecognized color function: ' + layer);
  }
  td.on('click', () => onClick(td, type, colorFunction));
  return td;
}

function createRadioFor(colorType) {
  const buttonAndLabel = [];
  buttonAndLabel.push($(document.createElement('input')).attr({
    name: 'color-type',
    type: 'radio',
    id: colorType + '-radio',
    value: colorType,
  }));
  buttonAndLabel.push($(document.createElement('label'))
      .prop('for', colorType + 'radio')
      .text(colorType));
  buttonAndLabel.push($(document.createElement('span')).text('  '));
  return buttonAndLabel;
}

function onClick(td, type, colorFunction) {
  if (type === ColorFunctionType.NONE) {
    return;
  }
  const colorFunctionDiv = $('#color-fxn-editor');
  colorFunctionDiv.show();
  if (td === globalTd) {
    return;
  }
  $('.color-type-div').hide();
  switch (type) {
    case ColorFunctionType.SINGLE:
      $('#single-color-radio').prop('checked', true);
      $('#single').show();
      globalTd = td;
      $('#single-color-picker').val(colorFunction['single-color']);
      break;
    case ColorFunctionType.CONTINUOUS:
      $('#continuous-radio').prop('checked', true);
      $('#continuous').show();
      break;
    case ColorFunctionType.DISCRETE:
      $('#discrete-radio').prop('checked', true);
      $('#discrete').show();
      break;
  }
}