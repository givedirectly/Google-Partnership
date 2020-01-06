import {colorMap, ColorStyle} from '../firebase_layers.js';

import {getCurrentLayers, getRowIndex, ILLEGAL_STATE_ERR, setStatus, updateLayersInFirestore} from './manage_layers_lib.js';

export {populateColorFunctions, withColor};
// Visible for testing.
export {
  setColor,
  setDiscreteColor,
  setProperty,
};

// At any given point in time, the color function div is displaying info
// about a single asset. We use this global cell to keep track of which
// color function info is currently displayed.
let globalTd;

/**
 * Fills out the #single #continuous and #discrete divs with the relevant
 * DOM elements with attached on-change handlers.
 */
function populateColorFunctions() {
  colorStyleTypeStrings.forEach(
      (typeAsString, colorStyle) =>
          $('#' + typeAsString + '-radio')
              .on('change', () => switchSchema(colorStyle)));
  $('#property-radio').on('change', () => {
    const lastByPropertyType =
        colorStyleTypeStrings.get(getColorFunction()['last-by-property-style']);
    $('#' + lastByPropertyType + '-radio')
        .prop('checked', true)
        .trigger('change');
  });

  const singleColorPicker = createColorPicker('single-color-picker');
  singleColorPicker.on('change', () => setColor(singleColorPicker));
  $('#single').append(
      createLabelFor(singleColorPicker, 'color'), singleColorPicker);

  const continuousColorPicker = createColorPicker('continuous-color-picker');
  continuousColorPicker.on('change', () => setColor(continuousColorPicker));

  const propertyPicker =
      $(document.createElement('select')).on('change', () => {
        const property = propertyPicker.val();
        setProperty(property);
        switch (getColorFunction()['current-style']) {
          case ColorStyle.CONTINUOUS:
            maybeDisplayMinMax(property);
            break;
          case ColorStyle.DISCRETE:
            populateDiscreteColorPickers(property);
            break;
          case ColorStyle.SINGLE:
            throw Error('Tried to set property while in single color mode');
        }
      });
  $('#property-picker').append(propertyPicker);

  const minMaxDiv =
      $(document.createElement('div'))
          .prop('id', 'min-max')
          .append([
            createMinOrMaxInputForContinuous(true, continuousPropertyPicker),
            createMinOrMaxInputForContinuous(false, continuousPropertyPicker),
            $(document.createElement('p'))
                .prop('id', 'max-min-error')
                .text('Error: min value > max value')
                .hide(),
          ])
          .hide();
  $('#continuous').append([
    createLabelFor(continuousColorPicker, 'base color'),
    continuousColorPicker,
    $(document.createElement('br')),
    minMaxDiv,
  ]);

  const tooManyValuesWarning = $(document.createElement('p'))
                                   .prop('id', 'too-many-values')
                                   .text('Too many values to color discretely')
                                   .hide();
  const discreteColorPickers =
      $(document.createElement('ul')).prop('id', 'discrete-color-pickers');
  $('#discrete').append(tooManyValuesWarning, discreteColorPickers);
}

/**
 * Writes most current disasterData information for {@link globalTd} to
 * firestore and also refreshes the boxes in {@link globalTd}.
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function updateTdAndFirestore() {
  const colorFunction = getColorFunction();
  const style = colorFunction['current-style'];
  globalTd.empty();
  if (style === ColorStyle.DISCRETE) {
    createColorBoxesForDiscrete(colorFunction, globalTd);
  } else {
    globalTd.append(createColorBox(colorFunction['color']));
  }
  return updateLayersInFirestore();
}

/**
 *  Updates the 'field' property which is shared by the continuous and discrete
 * color schemas.
 * @param {string} property
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function setProperty(property) {
  getColorFunction()['field'] = property;
  return updateTdAndFirestore();
}

/**
 * If there's a set property, ('field' in firestore,) shows the min-max div and
 * fills it in with the currently picked property's max and min. Else, hides
 * the min and max and returns early.
 * @param {string} property
 */
function maybeDisplayMinMax(property) {
  const minMaxDiv = $('#min-max');
  if (!property) {
    minMaxDiv.hide();
    return;
  }
  minMaxDiv.show();
  const stats = getColorFunction()['columns'][property];
  $('#continuous-min').val(stats['min']);
  $('#continuous-max').val(stats['max']);
}

/**
 * Validates the given min or max value is valid and writes it.
 * @param {boolean} min
 * @param {JQuery<HTMLElement>} continuousPropertyPicker
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish. Also returns null
 * if the new max or min value was bad.
 */
function updateMinMax(min, continuousPropertyPicker) {
  const property = continuousPropertyPicker.val();
  const input = min ? $('#continuous-min') : $('#continuous-max');
  const potentialNewVal = Number(input.val());
  const propertyStats = getColorFunction()['columns'][property];
  let minOrMax;
  const errorDiv = $('#max-min-error');
  if (min) {
    minOrMax = 'min';
    if (potentialNewVal > propertyStats['max']) {
      errorDiv.show();
      return null;
    }
  } else {
    minOrMax = 'max';
    if (potentialNewVal < propertyStats['min']) {
      errorDiv.show();
      return null;
    }
  }
  errorDiv.hide();
  propertyStats[minOrMax] = potentialNewVal;
  return updateLayersInFirestore();
}

/**
 * Updates an individual color choice for a single value in the discrete schema.
 * @param {JQuery<HTMLElement>} picker
 */
function setDiscreteColor(picker) {
  const colorFunction = getColorFunction();
  const propertyValue = picker.data(discreteColorPickerDataKey);
  colorFunction['colors'][propertyValue] = picker.val();
  updateTdAndFirestore();
}

/**
 * Updates the 'color' property which is shared by the continuous and single
 * color schemas.
 * @param {JQuery<HTMLElement>} picker
 */
function setColor(picker) {
  getColorFunction()['color'] = picker.val();
  updateTdAndFirestore();
}

/**
 *
 * @param {boolean} min if true, creating for min, else for max
 * @param {JQuery<HTMLElement>} continuousPropertyPicker
 * @return {JQuery<HTMLLabelElement>} containing the relevant input
 */
function createMinOrMaxInputForContinuous(min, continuousPropertyPicker) {
  const minOrMax = min ? 'min' : 'max';
  const input =
      $(document.createElement('input'))
          .prop('id', 'continuous-' + minOrMax)
          .on('blur', () => updateMinMax(min, continuousPropertyPicker));
  // TODO: add padding to all labels and take out spaces in label text.
  return $(document.createElement('label')).text(minOrMax + ': ').append(input);
}

const colorList = Array.from(colorMap.keys());

/**
 * Creates a picker with our known colors.
 * @param {?string} id
 * @return {JQuery<HTMLSelectElement>}
 */
function createColorPicker(id) {
  const colorPicker = $(document.createElement('select'));
  for (const color of colorList) {
    const option = $(document.createElement('option')).val(color).text(color);
    colorPicker.append(option);
  }
  if (id) {
    colorPicker.prop('id', id);
  }
  return colorPicker;
}

const colorStyleTypeStrings = new Map();
for (const t in ColorStyle) {
  if (ColorStyle.hasOwnProperty(t)) {
    colorStyleTypeStrings.set(ColorStyle[t], t);
  }
}

/**
 * Utility function - helps create a label for the given element.
 * @param {JQuery<HTMLLabelElement>} element
 * @param {string} text
 * @return {JQuery<HTMLLabelElement>}
 */
function createLabelFor(element, text) {
  return $(document.createElement('label'))
      .prop('for', element.prop('id'))
      .text(text.concat(': '));
}

/**
 * Adds color function info to the given td.
 * @param {JQuery<HTMLElement>} td
 * @param {Object} layer
 * @param {string} property
 * @return {JQuery<HTMLElement>}
 */
function withColor(td, layer, property) {
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
  td.addClass('editable color-td')
      .on('click', () => onClick(td, colorFunction['current-style']));
  return td;
}

/**
 * On click function for color tds - updates the globalTd.
 * @param {JQuery<HTMLElement>} td
 * @param {enum} type
 */
function onClick(td, type) {
  if ($(td).hasClass('na')) {
    return;
  }
  const colorFunctionDiv = $('#color-fxn-editor');
  if (colorFunctionDiv.is(':visible') && td === globalTd) {
    colorFunctionDiv.hide();
    selectCurrentRow(false);
    return;
  }
  colorFunctionDiv.show();
  if (td === globalTd) {
    selectCurrentRow(true);
    return;
  }
  selectCurrentRow(false);
  globalTd = td;
  selectCurrentRow(true);
  if (type !== ColorStyle.SINGLE) {
    $('#property-radio').prop('checked', true);
  }
  $('#' + colorStyleTypeStrings.get(type) + '-radio').prop('checked', true);
  displaySchema(type);
}

/**
 * Highlights or unhighlights the row of the current global td.
 * @param {boolean} selected
 */
function selectCurrentRow(selected) {
  if (selected) {
    $(globalTd).parent('tr').addClass('selected');
  } else {
    $(globalTd).parent('tr').removeClass('selected');
  }
}

/**
 * Switches the schema of {@link globalTd} to the given type, shows the
 * div of the new type, updates {@link globalTd}'s contents and writes to
 * firestore.
 * @param {enum} type
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function switchSchema(type) {
  displaySchema(type);
  const colorFunction = getColorFunction();
  colorFunction['current-style'] = type;
  if (type !== ColorStyle.SINGLE) {
    colorFunction['last-by-property-style'] = type;
  }
  return updateTdAndFirestore();
}

/**
 * Displays the given schema in the color editor box.
 * @param {enum} type
 */
function displaySchema(type) {
  const colorFunction = getColorFunction();
  $('.color-type-div').hide();
  const byPropertyDiv = $('#by-property');
  const continuousDiv = $('#continuous');
  const discreteDiv = $('#discrete');
  const propertyPicker = $('#property-picker');
  const property = propertyPicker.val();
  switch (type) {
    case ColorStyle.SINGLE:
      $('#single-color-picker').val(colorFunction['color']);
      $('#single').show();
      break;
    case ColorStyle.CONTINUOUS:
      // WORKING HERE - should be able to combine these two!

      $('#continuous-color-picker').val(colorFunction['color']);
      populatePropertyPicker(propertyPicker);
      maybeDisplayMinMax(property);
      byPropertyDiv.show();
      discreteDiv.hide();
      continuousDiv.show();
      break;
    case ColorStyle.DISCRETE:
      populatePropertyPicker(propertyPicker);
      populateDiscreteColorPickers(property);
      byPropertyDiv.show();
      continuousDiv.hide();
      discreteDiv.show();
      break;
  }
}

/**
 * Updates the given select element with the properties of the earth engine
 * asset related to {@link globalTd}.
 * @param {JQuery<HTMLElement>} picker
 */
function populatePropertyPicker(picker) {
  picker.empty();
  const colorFunction = getColorFunction();
  const properties = colorFunction['columns'];
  const asOptions = [];
  Object.keys(properties)
      .forEach(
          (key) => asOptions.push(
              $(document.createElement('option')).val(key).text(key)));
  picker.append(asOptions).val(colorFunction['field']);
}

// The key for the data in each discrete schema color select to know which
// property it's linked to.
const discreteColorPickerDataKey = 'value';

/**
 * Updates the list of color pickers for the discrete schema to have one for
 * each property of the earth engine asset related to {@link globalTd}.
 *
 * We add a piece of data to each of these pickers so they know what property
 * they're attached to.
 */
function populateDiscreteColorPickers(property) {
  const pickerList = $('#discrete-color-pickers').empty();
  const colorFunction = getColorFunction();
  if (!colorFunction['field']) {
    return;
  }
  const values =
      colorFunction['columns'][$('#discrete-property-picker').val()]['values'];
  if (values.length === 0) {
    $('#too-many-values').show();
  } else {
    $('#too-many-values').hide();
  }
  const asColorPickers = [];
  const colors = colorFunction['colors'];
  for (const value of values) {
    const li = $(document.createElement('li'));
    li.append($(document.createElement('label')).text(value + ': '));
    const colorPicker =
        createColorPicker()
            .on('change', (event) => setDiscreteColor($(event.target)))
            .data(discreteColorPickerDataKey, value)
            .val(colors[value]);
    li.append(colorPicker);
    asColorPickers.push(li);
  }
  pickerList.append(asColorPickers);
}

/**
 * Creates the set of color boxes for a discrete schema.
 * @param {Object} colorFunction
 * @param {JQuery<HTMLElement>} td cell in which to create the boxes.
 */
function createColorBoxesForDiscrete(colorFunction, td) {
  const colorObject = colorFunction['colors'];
  const colorSet = new Set();
  if (Object.keys(colorObject).length === 0) {
    td.append(createColorBox());
    return;
  }
  Object.keys(colorObject).forEach((propertyValue) => {
    const color = colorObject[propertyValue];
    if (!colorSet.has(color)) {
      colorSet.add(color);
      td.append(createColorBox(colorObject[propertyValue]));
    }
  });
}

/**
 * Creates an instance of the color boxes for the color col.
 * @param {?string} color what color to make the box.
 * @return {JQuery<HTMLDivElement>}
 */
function createColorBox(color = 'transparent') {
  return $(document.createElement('div'))
      .addClass('box')
      .css('background-color', color);
}

/**
 * Gets color function related to {@link globalTd}.
 * @return {Object}
 */
function getColorFunction() {
  const index = getRowIndex(globalTd.parents('tr'));
  return getCurrentLayers()[index]['color-function'];
}
