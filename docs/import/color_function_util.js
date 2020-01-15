import {colorMap, ColorStyle} from '../firebase_layers.js';
import {showErrorSnackbar} from '../snackbar.js';
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
 * Displays a warning in color function editor if field or color(s) are missing
 * @param {boolean} hasField
 * @param {boolean} hasColor
 * @param {string} colorText
 */
function maybeDisplayFieldAndColorWarningWithSchema(
    hasField, hasColor, colorText = '') {
  const warning = $('#warning');
  const warningText = $('#missing-fields-warning');
  warning.hide();
  const getWarning = (missing) =>
      '<b>Warning: layer missing ' + missing + '. May not show up on map.</b>';
  if (hasField) {
    if (!hasColor) {
      warningText.html(getWarning(colorText));
      warning.show();
    }
  } else {
    if (hasColor) {
      warningText.html(getWarning('property'));
      warning.show();
    } else {
      warningText.html(getWarning('property and ' + colorText));
      warning.show();
    }
  }
}

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
        colorStyleTypeStrings.get(getColorFunction().lastByPropertyStyle);
    $('#' + lastByPropertyType + '-radio')
        .prop('checked', true)
        .trigger('change');
  });

  const propertyPicker = $('#property-picker');

  const singleColorPicker = createColorPicker('single-color-picker');
  singleColorPicker.on('change', () => {
    $('#warning').hide();
    setColor(singleColorPicker);
  });
  $('#single').append(
      createLabelForMandatoryPicker(singleColorPicker, 'color'),
      singleColorPicker);

  const continuousColorPicker = createColorPicker('continuous-color-picker');
  continuousColorPicker.on('change', () => {
    maybeDisplayFieldAndColorWarningWithSchema(
        !!getColorFunction().field, true);
    setColor(continuousColorPicker);
  });

  // TODO: make an educated guess about if this property should
  // be continuous or discrete (based on # distinct vals?)
  // TODO: disable discrete if >25 values and add hover text explaining disable
  propertyPicker.on('change', () => {
    setProperty(propertyPicker.val());
    const {color, currentStyle} = getColorFunction();
    switch (currentStyle) {
      case ColorStyle.CONTINUOUS:
        maybeDisplayFieldAndColorWarningWithSchema(true, !!color, 'color');
        maybeDisplayMinMax();
        break;
      case ColorStyle.DISCRETE:
        maybeDisplayFieldAndColorWarningWithSchema(
            true, !!populateDiscreteColorPickersAndCheckHasAllColors(),
            'at least one color');
        break;
      case ColorStyle.SINGLE:
        const error =
            'Somehow tried to set property while in single color mode';
        showErrorSnackbar(error);
        throw Error(error);
    }
  });

  const minMaxDiv =
      $(document.createElement('div'))
          .prop('id', 'min-max')
          .append([
            createMinOrMaxInputForContinuous(true, propertyPicker),
            createMinOrMaxInputForContinuous(false, propertyPicker),
            $(document.createElement('p'))
                .prop('id', 'max-min-error')
                .text('Error: min value > max value')
                .hide(),
          ])
          .hide();
  $('#continuous').append([
    createLabelForMandatoryPicker(continuousColorPicker, 'base color'),
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
  globalTd.empty();
  if (colorFunction.currentStyle === ColorStyle.DISCRETE) {
    createColorBoxesForDiscrete(colorFunction, globalTd);
  } else {
    globalTd.append(createColorBox(colorFunction.color));
  }
  return updateLayersInFirestore();
}

/**
 * Updates the 'field' property which is shared by the continuous and discrete
 * color schemas.
 * @param {string} property
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function setProperty(property) {
  getColorFunction().field = property;
  return updateTdAndFirestore();
}

/**
 * If there's a set property, ('field' in firestore,) shows the min-max div and
 * fills it in with the currently picked property's max and min. Else, hides
 * the min and max and returns early.
 */
function maybeDisplayMinMax() {
  const property = getColorFunction().field;
  const minMaxDiv = $('#min-max');
  if (!property) {
    minMaxDiv.hide();
    return;
  }
  minMaxDiv.show();
  const stats = getColorFunction().columns[property];
  $('#continuous-min').val(stats.min);
  $('#continuous-max').val(stats.max);
}

/**
 * Validates the given min or max value is valid and writes it.
 * @param {boolean} min
 * @param {JQuery<HTMLElement>} propertyPicker
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish. Also returns null
 * if the new max or min value was bad.
 */
function updateMinMax(min, propertyPicker) {
  const input = min ? $('#continuous-min') : $('#continuous-max');
  const potentialNewVal = Number(input.val());
  const propertyStats = getColorFunction().columns[propertyPicker.val()];
  let minOrMax;
  const errorDiv = $('#max-min-error');
  if (min) {
    minOrMax = 'min';
    if (potentialNewVal > propertyStats.max) {
      errorDiv.show();
      return null;
    }
  } else {
    minOrMax = 'max';
    if (potentialNewVal < propertyStats.min) {
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
 * and hides the warning about missing colors if all color boxes are selected.
 * @param {JQuery<HTMLElement>} picker
 */
function setDiscreteColor(picker) {
  let hasAllColors = true;
  $('#discrete-color-pickers')
      .find('select')
      .each(/* @this HTMLElement */ function() {
        if (!$(this).val()) {
          hasAllColors = false;
          return false;
        }
      });
  if (hasAllColors) {
    $('#warning').hide();
  }
  const colorFunction = getColorFunction();
  const propertyValue = picker.data(discreteColorPickerDataKey);
  colorFunction.colors[propertyValue] = picker.val();
  updateTdAndFirestore();
}

/**
 * Updates the 'color' property which is shared by the continuous and single
 * color schemas.
 * @param {JQuery<HTMLElement>} picker
 */
function setColor(picker) {
  getColorFunction().color = picker.val();
  updateTdAndFirestore();
}

/**
 *
 * @param {boolean} min if true, creating for min, else for max
 * @param {JQuery<HTMLElement>} propertyPicker
 * @return {JQuery<HTMLLabelElement>} containing the relevant input
 */
function createMinOrMaxInputForContinuous(min, propertyPicker) {
  const minOrMax = min ? 'min' : 'max';
  const input = $(document.createElement('input'))
                    .prop('id', 'continuous-' + minOrMax)
                    .on('blur', () => updateMinMax(min, propertyPicker));
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

/** An asterisk that gets styled to be red to help mark fields as mandatory. */
const mandatory = '<span class="mandatory">*</span>';

/**
 * Utility function - helps create a label for the given element.
 * @param {JQuery<HTMLLabelElement>} element
 * @param {string} text
 * @return {JQuery<HTMLLabelElement>}
 */
function createLabelForMandatoryPicker(element, text) {
  return $(document.createElement('label'))
      .prop('for', element.prop('id'))
      .html(text.concat(mandatory + ': '));
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
  switch (colorFunction.currentStyle) {
    case ColorStyle.SINGLE:
      td.append(createColorBox(colorFunction.color));
      break;
    case ColorStyle.CONTINUOUS:
      td.append(createColorBox(colorFunction.color));
      break;
    case ColorStyle.DISCRETE:
      createColorBoxesForDiscrete(colorFunction, td);
      break;
    default:
      setStatus(ILLEGAL_STATE_ERR + 'unrecognized color function: ' + layer);
  }
  td.addClass('editable color-td').on('click', () => onClick(td));
  return td;
}

/**
 * On click function for color tds - updates the globalTd.
 * @param {JQuery<HTMLElement>} td
 */
function onClick(td) {
  if ($(td).hasClass('na')) {
    return;
  }

  const colorFunctionDiv = $('#color-fxn-editor');
  // open -> closed
  if (colorFunctionDiv.is(':visible') && td === globalTd) {
    colorFunctionDiv.hide();
    selectCurrentRow(false);
    return;
  }

  // most recent closed -> open
  if (td === globalTd) {
    colorFunctionDiv.show();
    selectCurrentRow(true);
    return;
  }

  // open td other than most recent closed
  colorFunctionDiv.show();
  selectCurrentRow(false);
  globalTd = td;
  selectCurrentRow(true);
  const {currentStyle} = getColorFunction();
  $('#' + colorStyleTypeStrings.get(currentStyle) + '-radio')
      .prop('checked', true);
  if (currentStyle !== ColorStyle.SINGLE) {
    $('#property-radio').prop('checked', true);
  }
  displaySchema(currentStyle);
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
  const colorFunction = getColorFunction();
  colorFunction.currentStyle = type;
  if (type !== ColorStyle.SINGLE) {
    colorFunction.lastByPropertyStyle = type;
  }

  displaySchema(type);
  return updateTdAndFirestore();
}

/**
 * Displays the given schema in the color editor box.
 * @param {ColorStyle} type
 */
function displaySchema(type) {
  $('#warning').hide();

  const {field, color} = getColorFunction();
  switch (type) {
    case ColorStyle.SINGLE:
      $('#single-color-picker').val(color);
      maybeDisplayFieldAndColorWarningWithSchema(true, !!color, 'color');
      $('#single').show();
      $('#by-property').hide();
      break;
    case ColorStyle.CONTINUOUS:
      $('#continuous-color-picker').val(color);
      populatePropertyPicker($('#property-picker'));
      maybeDisplayMinMax();
      maybeDisplayFieldAndColorWarningWithSchema(!!field, !!color, 'color');
      $('#single').hide();
      $('#by-property').show();
      $('#discrete').hide();
      $('#continuous').show();
      break;
    case ColorStyle.DISCRETE:
      populatePropertyPicker($('#property-picker'));
      maybeDisplayFieldAndColorWarningWithSchema(
          !!field, !!populateDiscreteColorPickersAndCheckHasAllColors(),
          'at least one color');
      $('#single').hide();
      $('#by-property').show();
      $('#continuous').hide();
      $('#discrete').show();
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
  const {columns} = colorFunction;
  const asOptions = [];
  Object.keys(columns).forEach(
      (key) => asOptions.push(
          $(document.createElement('option')).val(key).text(key)));
  picker.append(asOptions).val(colorFunction.field);
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
 *
 * If we haven't selected a property yet or we've calculated there are too
 * many values for discrete colors, don't make any color pickers and return
 * early.
 * @return {boolean} returns true if we don't have any color pickers or all
 * color pickers have non-null values.
 */
function populateDiscreteColorPickersAndCheckHasAllColors() {
  const pickerList = $('#discrete-color-pickers').empty();
  const tooManyValuesWarning = $('#too-many-values').hide();
  const colorFunction = getColorFunction();
  const field = colorFunction.field;
  if (!field) {
    return true;
  }
  const values = colorFunction['columns'][field]['values'];
  if (values.length === 0) {
    tooManyValuesWarning.show();
    return true;
  }
  const asColorPickers = [];
  const {colors} = colorFunction;
  let hasAllColors = true;
  for (const value of values) {
    const li = $(document.createElement('li'));
    li.append($(document.createElement('label')).text(value + ': '));
    const color = colors[value];
    const colorPicker =
        createColorPicker()
            .on('change', (event) => setDiscreteColor($(event.target)))
            .data(discreteColorPickerDataKey, value)
            .val(color);
    li.append(colorPicker);
    asColorPickers.push(li);

    if (!color) hasAllColors = false;
  }
  pickerList.append(asColorPickers);
  return hasAllColors;
}

/**
 * Creates the set of color boxes for a discrete schema.
 * @param {Object} colorFunction
 * @param {JQuery<HTMLElement>} td cell in which to create the boxes.
 */
function createColorBoxesForDiscrete(colorFunction, td) {
  const {colors} = colorFunction;
  const colorSet = new Set();
  if (Object.keys(colors).length === 0) {
    td.append(createColorBox());
    return;
  }
  Object.keys(colors).forEach((propertyValue) => {
    const color = colors[propertyValue];
    if (!colorSet.has(color)) {
      colorSet.add(color);
      td.append(createColorBox(colors[propertyValue]));
    }
  });
}

/**
 * Creates an instance of the color boxes for the color col.
 * @param {?string} color what color to make the box. If null, transparent.
 * @return {JQuery<HTMLDivElement>}
 */
function createColorBox(color) {
  const rgb = color ? colorToRgbString(color) : 'transparent';
  return $(document.createElement('div'))
      .addClass('box')
      .css('background-color', rgb);
}

/**
 * Gets color function related to {@link globalTd}.
 * @return {Object}
 */
function getColorFunction() {
  const index = getRowIndex(globalTd.parents('tr'));
  return getCurrentLayers()[index].colorFunction;
}
