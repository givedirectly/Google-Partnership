import {colorMap, ColorStyle} from '../firebase_layers.js';
import {getCurrentLayers, getRowIndex, ILLEGAL_STATE_ERR, setStatus, updateLayersInFirestore} from './add_disaster_util.js';

export {populateColorFunctions, withColor};

let globalTd;

function populateColorFunctions() {
  const colorFunctionDiv = $('#color-fxn-editor');
  colorFunctionDiv.prepend(createRadioFor(ColorStyle.SINGLE));
  colorFunctionDiv.prepend(createRadioFor(ColorStyle.DISCRETE));
  colorFunctionDiv.prepend(createRadioFor(ColorStyle.CONTINUOUS));

  const singleColorPicker = createColorPicker('single-color-picker');
  singleColorPicker.on('change', () => setSingleColor(singleColorPicker));
  $('#single').append(
      createLabelFor(singleColorPicker, 'color: '), singleColorPicker);

  const continuousPicker = createColorPicker('continuous-picker');
  continuousPicker.on('change', () => setBaseColor(continuousPicker));
  const continuousPropertyPicker =
      $(document.createElement('select'))
          .prop('id', 'continuous-property-picker');
  continuousPropertyPicker.on(
      'change', () => setProperty(continuousPropertyPicker));
  $('#continuous')
      .append(
          createLabelFor(continuousPicker, 'base color: '), continuousPicker,
          getBreak(), createLabelFor(continuousPropertyPicker, 'property: '),
          continuousPropertyPicker);

  const discretePropertyPicker = $(document.createElement('select'))
                                     .prop('id', 'discrete-property-picker');
  discretePropertyPicker.on('change', () => {
    setProperty(discretePropertyPicker);
    setDiscreteColorPickers(globalTd);
  });
  const discreteColorPickers =
      $(document.createElement('ul')).prop('id', 'discrete-color-pickers');
  $('#discrete')
      .append(
          createLabelFor(discretePropertyPicker, 'property: '),
          discretePropertyPicker, discreteColorPickers);
}

function setProperty(picker) {
  const index = getRowIndex(globalTd.parents('tr'));
  getCurrentLayers()[index]['color-function']['field'] = picker.val();
  updateLayersInFirestore();
}

function setDiscreteColor(picker) {
  const index = getRowIndex(globalTd.parents('tr'));
  const propertyValue = picker.data('value');
  getCurrentLayers()[index]['color-function']['colors'][propertyValue] = picker.val();
  updateLayersInFirestore();
  globalTd.empty();
  createColorBoxesForDiscrete(getCurrentLayers()[index]['color-function'], globalTd);
}

function setBaseColor(picker) {
  const index = getRowIndex(globalTd.parents('tr'));
  getCurrentLayers()[index]['color-function']['color'] = picker.val();
  updateLayersInFirestore();
  globalTd.empty();
  globalTd.append(createColorBox(picker.val()));
}

function setSingleColor(picker) {
  const index = getRowIndex(globalTd.parents('tr'));
  getCurrentLayers()[index]['color-function']['color'] = picker.val();
  updateLayersInFirestore();
  globalTd.empty();
  globalTd.append(createColorBox(picker.val()));
}

function createColorPicker(id) {
  const colorPicker = $(document.createElement('select'));
  colorMap.forEach((value, key) => {
    const option = $(document.createElement('option')).val(key).text(key);
    colorPicker.append(option);
  });
  return colorPicker.prop('id', id);
}

const colorStyleTypeStrings = new Map();
for (const t in ColorStyle) {
  if (ColorStyle.hasOwnProperty(t)) {
    colorStyleTypeStrings.set(ColorStyle[t], t);
  }
}

function createRadioFor(colorType) {
  const buttonAndLabel = [];
  buttonAndLabel.push($(document.createElement('input')).attr({
    name: 'color-type',
    type: 'radio',
    id: colorStyleTypeStrings.get(colorType) + '-radio',
    value: colorType,
  }).on('change', () => {
    switchSchema(colorType);
  }));
  buttonAndLabel.push($(document.createElement('label'))
      .prop('for', colorType + 'radio')
      .text(colorStyleTypeStrings.get(colorType)));
  buttonAndLabel.push($(document.createElement('span')).text('  '));
  return buttonAndLabel;
}

function createLabelFor(element, text) {
  return $(document.createElement('label'))
      .prop('for', element.prop('id'))
      .text(text);
}

function getBreak() {
  return $(document.createElement('br'));
}

///////////////////////////////////////////////////////////

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
      createColorBoxesForDiscrete(colorFunction, td);
      break;
    default:
      setStatus(ILLEGAL_STATE_ERR + 'unrecognized color function: ' + layer);
  }
  td.on(
      'click',
      () => onClick(td, colorFunction['current-style']));
  return td;
}

function createColorBoxesForDiscrete(colorFunction, td) {
  const colorObject = colorFunction['colors'];
  // coming from a place that has never had discrete before
  if (!colorObject) {
    td.append(createColorBox(colorFunction['color']));
    return;
  }
  const colorSet = new Set();
  Object.keys(colorObject).forEach((propertyValue) => {
    const color = colorObject[propertyValue];
    if (!colorSet.has(color)) {
      colorSet.add(color);
      td.append(createColorBox(colorObject[propertyValue]));
    }
  });
}

function onClick(td, type) {
  if ($(td).hasClass('na')) {
    return;
  }
  const colorFunctionDiv = $('#color-fxn-editor');
  if (colorFunctionDiv.is(':visible') && td === globalTd) {
    colorFunctionDiv.hide();
    return;
  }
  colorFunctionDiv.show();
  if (td === globalTd) {
    return;
  }
  globalTd = td;
  $('#' + colorStyleTypeStrings.get(type) + '-radio').prop('checked', true).trigger('change');
  // switchSchema(type);
}

function switchSchema(type) {
  const index = getRowIndex(globalTd.parents('tr'));
  const colorFunction = getCurrentLayers()[index]['color-function'];
  $('.color-type-div').hide();
  switch (type) {
    case ColorStyle.SINGLE:
      $('#single-color-radio').prop('checked', true);
      $('#single-color-picker').val(colorFunction['color']);
      globalTd.empty();
      globalTd.append(createColorBox( $('#single-color-picker').val()));
      $('#single').show();
      break;
    case ColorStyle.CONTINUOUS:
      $('#continuous-radio').prop('checked', true);
      $('#continuous-picker').val(colorFunction['color']);
      setPropertyPicker($('#continuous-property-picker'), globalTd);
      globalTd.empty();
      globalTd.append(createColorBox( $('#continuous-picker').val()));
      $('#continuous').show();
      break;
    case ColorStyle.DISCRETE:
      $('#discrete-radio').prop('checked', true);
      setPropertyPicker($('#discrete-property-picker'), globalTd);
      setDiscreteColorPickers(globalTd);
      globalTd.empty();
      createColorBoxesForDiscrete(colorFunction, globalTd);
      $('#discrete').show();
      break;
  }
}

function setPropertyPicker(picker, td) {
  picker.empty();
  const index = getRowIndex(td.parents('tr'));
  const colorFunction = getCurrentLayers()[index]['color-function'];
  const properties = colorFunction['columns'];
  const asOptions = [];
  Object.keys(properties).forEach((key) => {
    asOptions.push($(document.createElement('option')).val(key).text(key));
  });
  picker.append(asOptions).val(colorFunction['field']);
}

function setDiscreteColorPickers(td) {
  const pickerList = $('#discrete-color-pickers').empty();
  const index = getRowIndex(td.parents('tr'));
  const values =
      getCurrentLayers()[index]['color-function']['columns'][$('#discrete-property-picker')
                                                                 .val()]['values'];
  const asColorPickers = [];
  for (const value of values) {
    const li = $(document.createElement('li'));
    li.append($(document.createElement('label')).text(value + ': '));
    // maybe always initialize color array?
    const color = getCurrentLayers()[index]['color-function']['colors'] ? getCurrentLayers()[index]['color-function']['colors'][value] : getCurrentLayers()[index]['color-function']['color'];
    const colorPicker =
        createColorPicker()
            .on('change', (event) => setDiscreteColor($(event.target)))
            .val(color)
            .data('value', value);
    li.append(colorPicker);
    asColorPickers.push(li);
  }
  pickerList.append(asColorPickers);
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
