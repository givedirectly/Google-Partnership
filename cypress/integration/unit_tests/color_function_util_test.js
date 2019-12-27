import {getLinearGradient, populateColorFunctions, withColor} from '../../../docs/import/color_function_util.js';
import * as manageLayersLib from '../../../docs/import/manage_layers_lib.js';
import {getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import {createTrs, setDisasterAndLayers} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const property = 'color-function';
let writeToFirebaseStub;

describe('Unit tests for color function utility', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let colorFunctionEditor;

  before(() => {
    colorFunctionEditor =
        $(document.createElement('div')).prop('id', 'color-fxn-editor').hide();
    const colorTypeRadios = $(document.createElement('div'));
    colorTypeRadios.append(
        makeRadio('SINGLE-radio', 'property-or-single'),
        makeRadio('property-radio', 'property-or-single'));
    colorFunctionEditor.append(colorTypeRadios);
    const byPropertyDiv = makeTypeDiv('by-property', 'color-type-div');
    byPropertyDiv.append(
        makeRadio('CONTINUOUS-radio', 'by-property-type'),
        makeRadio('DISCRETE-radio', 'by-property-type'),
        makeTypeDiv('continuous'), makeTypeDiv('discrete'));
    colorFunctionEditor.append(
        makeTypeDiv('single', 'color-type-div'), byPropertyDiv);
    $(document.body).append(colorFunctionEditor);

    populateColorFunctions();
  });

  beforeEach(() => {
    writeToFirebaseStub = cy.stub(manageLayersLib, 'updateLayersInFirestore');
    colorFunctionEditor.hide();
  });

  afterEach(() => colorFunctionEditor.hide());

  it('updates min-max values', () => {
    // layer in pre-picking a property state
    const layer = {
      'color-function': {
        'current-style': 0,
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
    const wings = getCurrentLayers()[0]['color-function']['columns']['wings'];
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
      'color-function': {
        'current-style': 2,
        'last-by-property-style': 0,
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
    expect(getColorFunction()['color']).to.equal('yellow');

    // update color
    $('#single-color-picker').val('red').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction()['color']).to.equal('red');
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('red');

    // switch to continuous
    const propertyRadio = $('#property-radio');
    propertyRadio.trigger('change');
    expectOneFirebaseWrite();
    const continuousRadio = $('#CONTINUOUS-radio');
    expect(continuousRadio.prop('checked')).to.be.true;
    expect(continuousRadio.prop('style').display).to.equal('');
    const continuousPropertyPicker = $('#continuous-property-picker');
    expect(getColorFunction()['current-style']).to.equal(0);
    expect(getColorFunction()['color']).to.equal('red');
    expect(continuousPropertyPicker.val()).to.be.null;

    // update field
    continuousPropertyPicker.val('wings').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction()['field']).to.equal('wings');
    expect($('#continuous-color-picker').val()).to.equal('red');

    // switch to discrete
    const discreteRadio = $('#DISCRETE-radio');
    discreteRadio.trigger('change');
    expectOneFirebaseWrite();
    const discretePropertyPicker = $('#discrete-property-picker');
    expect(getColorFunction()['current-style']).to.equal(1);
    expect(td.children().length).to.equal(1);
    expect(getColorFunction()['field']).to.equal('wings');
    expect(discretePropertyPicker.val()).to.equal('wings');
    const discreteColorPickerList = $('#discrete-color-pickers');
    expect(discreteColorPickerList.children('li').length).to.equal(3);

    // update field
    discretePropertyPicker.val('legs').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction()['field']).to.equal('legs');

    // update discrete color
    expect(getColorFunction()['colors']).to.be.empty;
    discreteColorPickerList.children('li')
        .first()
        .children('select')
        .val('orange')
        .trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction()['colors']).to.eql({'0': 'orange'});
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

    // switch to single and back to check state was saved
    $('#SINGLE-radio').trigger('change');
    expectOneFirebaseWrite();
    propertyRadio.trigger('change');
    expectOneFirebaseWrite();
    expect(discreteRadio.prop('checked')).to.be.true;

    td.trigger('click');
    expect(colorFunctionEditor.is(':visible')).to.be.false;
    expect(writeToFirebaseStub).to.not.be.called;
  });

  it('creates the correct linear gradients', () => {
    const layer1 = {
      'color-function': {
        'current-style': 0,
        'color': 'yellow',
      },
    };

    const layer2 = {
      'color-function': {
        'current-style': 1,
        'colors': ['yellow', 'red'],
      },
    };

    const layer3 = {
      'color-function': {
        'current-style': 2,
        'color': 'blue',
      },
    };
    const layer1Gradient = 'linear-gradient(to right, white, yellow)';
    expect(getLinearGradient(layer1['color-function']))
        .to.equal(layer1Gradient);

    const layer2Gradient =
        'linear-gradient(to right, yellow 0%, yellow 50%, red 50%, red 100%)';
    expect(getLinearGradient(layer2['color-function']))
        .to.equal(layer2Gradient);

    const layer3Gradient = 'linear-gradient(to right, blue, blue)';
    expect(getLinearGradient(layer3['color-function']))
        .to.equal(layer3Gradient);
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
 * @param {string} className
 * @return {JQuery<HTMLDivElement>}
 */
function makeTypeDiv(id, className) {
  return $(document.createElement('div'))
      .attr({
        'id': id,
        'hidden': true,
      })
      .addClass(className);
}

/**
 * Makes a radio (mimicking html in manage-layers.html)
 * @param {string} id
 * @param {string} name
 * @return {JQuery<HTMLInputElement>}
 */
function makeRadio(id, name) {
  return $(document.createElement('input')).attr({
    'id': id,
    'name': name,
    'type': 'radio',
  });
}
