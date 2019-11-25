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
  singleColorPicker.on('change', () => setColor(singleColorPicker));
  $('#single').append(
      createLabelFor(singleColorPicker, 'color: '), singleColorPicker);

  const continuousPicker = createColorPicker('continuous-picker');
  continuousPicker.on('change', () => setColor(continuousPicker));
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
    setDiscreteColorPickers();
  });
  const discreteColorPickers =
      $(document.createElement('ul')).prop('id', 'discrete-color-pickers');
  $('#discrete')
      .append(
          createLabelFor(discretePropertyPicker, 'property: '),
          discretePropertyPicker, discreteColorPickers);
}

function setProperty(picker) {
  getColorFunction()['field'] = picker.val();
  updateLayersInFirestore();
}

function setDiscreteColor(picker) {
  const colorFunction = getColorFunction();
  const propertyValue = picker.data('value');
  colorFunction['colors'][propertyValue] = picker.val();
  updateLayersInFirestore();
  populateColorTd(true);
}

function setColor(picker) {
  getColorFunction()['color'] = picker.val();
  updateLayersInFirestore();
  populateColorTd(false);
}

function populateColorTd(discrete) {
  const colorFunction = getColorFunction();
  globalTd.empty();
  if (discrete) {
    createColorBoxesForDiscrete(colorFunction, globalTd);
  } else {
    globalTd.append(createColorBox(colorFunction['color']));
  }
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
  buttonAndLabel.push($(document.createElement('input'))
                          .attr({
                            name: 'color-type',
                            type: 'radio',
                            id: colorStyleTypeStrings.get(colorType) + '-radio',
                            value: colorType,
                          })
                          .on('change', () => {
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
  td.on('click', () => onClick(td, colorFunction['current-style']));
  return td;
}

function createColorBoxesForDiscrete(colorFunction, td) {
  const colorObject = colorFunction['colors'];
  // coming from a place that has never had discrete before
  if (!colorObject) {
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
  $('#' + colorStyleTypeStrings.get(type) + '-radio')
      .prop('checked', true)
      .trigger('change');
}

function switchSchema(type) {
  const colorFunction = getColorFunction();
  $('.color-type-div').hide();
  switch (type) {
    case ColorStyle.SINGLE:
      $('#single-color-radio').prop('checked', true);
      $('#single-color-picker').val(colorFunction['color']);
      $('#single').show();
      break;
    case ColorStyle.CONTINUOUS:
      $('#continuous-radio').prop('checked', true);
      $('#continuous-picker').val(colorFunction['color']);
      setPropertyPicker($('#continuous-property-picker'));
      $('#continuous').show();
      break;
    case ColorStyle.DISCRETE:
      $('#discrete-radio').prop('checked', true);
      setPropertyPicker($('#discrete-property-picker'));
      if ($('#discrete-property-picker').val()) setDiscreteColorPickers();
      $('#discrete').show();
      break;
  }
  populateColorTd(type === ColorStyle.DISCRETE);
}

function setPropertyPicker(picker) {
  picker.empty();
  const colorFunction = getColorFunction();
  const properties = colorFunction['columns'];
  const asOptions = [];
  Object.keys(properties).forEach((key) => {
    asOptions.push($(document.createElement('option')).val(key).text(key));
  });
  picker.append(asOptions).val(colorFunction['field']);
}

function setDiscreteColorPickers() {
  const pickerList = $('#discrete-color-pickers').empty();
  const colorFunction = getColorFunction();
  const values =
      colorFunction['columns'][$('#discrete-property-picker').val()]['values'];
  const asColorPickers = [];
  const colors = getColorFunction()['colors'];
  for (const value of values) {
    const li = $(document.createElement('li'));
    li.append($(document.createElement('label')).text(value + ': '));
    const colorPicker =
        createColorPicker()
            .on('change', (event) => setDiscreteColor($(event.target)))
            .data('value', value)
            .val(colors ? colors[value] : null);
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

function getColorFunction() {
  const index = getRowIndex(globalTd.parents('tr'));
  return getCurrentLayers()[index]['color-function'];
}
