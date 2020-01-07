import {populateColorFunctions, withColor} from '../../../docs/import/color_function_util.js';
import * as manageLayersLib from '../../../docs/import/manage_layers_lib.js';
import {getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import {createTrs, setDisasterAndLayers} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const property = 'colorFunction';
let writeToFirebaseStub;

describe('Unit tests for color function utility', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let colorFunctionEditor;

  before(() => {
    colorFunctionEditor =
        $(document.createElement('div')).prop('id', 'color-fxn-editor').hide();
    colorFunctionEditor.append(
        makeTypeDiv('single'), makeTypeDiv('continuous'),
        makeTypeDiv('discrete'));
    $(document.body).append(colorFunctionEditor);

    populateColorFunctions();
  });

  beforeEach(() => {
    writeToFirebaseStub = cy.stub(manageLayersLib, 'updateLayersInFirestore');
    colorFunctionEditor.hide();
  });

  it('updates min-max values', () => {
    // layer in pre-picking a property state
    const layer = {
      'colorFunction': {
        'currentStyle': 0,
        'columns': {
          'wings': {'min': 0, 'max': 100, 'values': [0, 1, 2, 100]},
        },
      },
    };
    const td = setUpWithLayer(layer);
    td.trigger('click');
    const maxMin = $('#max-min');
    expect(maxMin.is(':visible')).to.be.false;

    const continuousPropertyPicker = $('#continuous-property-picker');
    continuousPropertyPicker.val('wings').trigger('change');
    expectOneFirebaseWrite();
    expect(maxMin.is(':visible'));
    const maxInput = $('#continuous-max');
    const minInput = $('#continuous-min');
    expect(maxInput.val()).to.equal('100');
    expect(minInput.val()).to.equal('0');
    // not one of actual values
    maxInput.val(20).trigger('blur');
    expectOneFirebaseWrite();
    // one of actual values
    minInput.val(1).trigger('blur');
    expectOneFirebaseWrite();

    // make sure new values still there on close and reopen.
    td.trigger('click');
    td.trigger('click');
    expect(maxMin.is(':visible'));
    expect(maxInput.val()).to.equal('20');
    expect(minInput.val()).to.equal('1');
    const wings = getCurrentLayers()[0].colorFunction.columns.wings;
    expect(wings['min']).to.equal(1);
    expect(wings['max']).to.equal(20);

    // try to input a bad val (min < max)
    const errorDiv = $('#max-min-error');
    expect(errorDiv.is(':visible')).to.be.false;
    minInput.val(30).trigger('blur');
    expect(errorDiv.is(':visible')).to.be.true;
    expect(errorDiv.text()).to.equal('Error: min value > max value');
    expect(writeToFirebaseStub).to.not.be.called;
    minInput.val(10).trigger('blur');
    expect(errorDiv.is(':visible')).to.be.false;
    expectOneFirebaseWrite();
  });

  it('switches schemas and writes data', () => {
    const layer = {
      'colorFunction': {
        'currentStyle': 2,
        'columns': {
          'wings': {'min': 0, 'max': 2, 'values': [0, 1, 2]},
          'legs': {'min': 0, 'max': 100, 'values': [0, 2, 4, 8, 100]},
        },
        'colors': {},
        'color': 'yellow',
      },
    };
    const td = setUpWithLayer(layer);
    expect(colorFunctionEditor.is(':visible')).to.be.false;

    td.trigger('click');
    expect(colorFunctionEditor.is(':visible')).to.be.true;
    expect(writeToFirebaseStub).to.not.be.called;
    expect(getColorFunction().color).to.equal('yellow');

    // update color
    $('#single-color-picker').val('red').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction().color).to.equal('red');
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('red');

    // switch to continuous
    $('#CONTINUOUS-radio').trigger('change');
    expectOneFirebaseWrite();
    const continuousPropertyPicker = $('#continuous-property-picker');
    let {currentStyle, color} = getColorFunction();
    expect(currentStyle).to.equal(0);
    expect(color).to.equal('red');
    expect(continuousPropertyPicker.val()).to.be.null;

    // update field
    continuousPropertyPicker.val('wings').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction().field).to.equal('wings');
    expect($('#continuous-color-picker').val()).to.equal('red');

    // switch to discrete
    $('#DISCRETE-radio').trigger('change');
    expectOneFirebaseWrite();
    const discretePropertyPicker = $('#discrete-property-picker');
    let field;
    ({currentStyle, field} = getColorFunction());
    expect(currentStyle).to.equal(1);
    expect(td.children().length).to.equal(0);
    expect(field).to.equal('wings');
    expect(discretePropertyPicker.val()).to.equal('wings');
    const discreteColorPickerList = $('#discrete-color-pickers');
    expect(discreteColorPickerList.children('li').length).to.equal(3);

    // update field
    discretePropertyPicker.val('legs').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction().field).to.equal('legs');

    // update discrete color
    expect(getColorFunction().colors).to.be.empty;
    discreteColorPickerList.children('li')
        .first()
        .children('select')
        .val('orange')
        .trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction().colors).to.eql({'0': 'orange'});
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('orange');

    // update another
    discreteColorPickerList.children()
        .eq(1)
        .children('select')
        .val('blue')
        .trigger('change');
    expectOneFirebaseWrite();
    expect(td.children().length).to.equal(2);
    expect(td.children().eq(1).css('background-color')).to.equal('blue');

    td.trigger('click');
    expect(colorFunctionEditor.is(':visible')).to.be.false;
    expect(writeToFirebaseStub).to.not.be.called;
  });
});

/**
 * Sets up td in row as expected by code with the given layer information.
 * @param {Object} layer
 * @return {JQuery<HTMLElement>}
 */
function setUpWithLayer(layer) {
  setDisasterAndLayers([layer]);

  const td = withColor($(document.createElement('td')), layer, property);
  const row = createTrs(1);
  row[0].append(td);

  return td;
}

/** Asserts we wrote to firebase once and clear stub history. */
function expectOneFirebaseWrite() {
  expect(writeToFirebaseStub).to.be.calledOnce;
  writeToFirebaseStub.resetHistory();
}

/**
 * Gets the current color function.
 * @return {Object}
 */
function getColorFunction() {
  return manageLayersLib.getCurrentLayers()[0][property];
}

/**
 * Makes one of the type divs (mimicking html in manage_layers.html)
 * @param {string} id
 * @return {JQuery<HTMLDivElement>}
 */
function makeTypeDiv(id) {
  return $(document.createElement('div'))
      .prop('id', id)
      .hide()
      .addClass('color-type-div');
}
