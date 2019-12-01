import * as addDisasterUtil from '../../../docs/import/manage_layers_lib.js';
import {populateColorFunctions, withColor} from '../../../docs/import/color_function_util.js';
import {createTrs, setDisasterAndLayers} from '../../support/import_test_util.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const property = 'color-function';
let writeToFirebaseStub;

describe('Unit tests for color function utility', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();

  let colorFunctionEditor;

  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));

    colorFunctionEditor =
        $(document.createElement('div')).prop('id', 'color-fxn-editor').hide();
    colorFunctionEditor.append(
        makeTypeDiv('single'), makeTypeDiv('continuous'),
        makeTypeDiv('discrete'));
    $(document.body).append(colorFunctionEditor);

    populateColorFunctions();
  });

  beforeEach(() => {
    writeToFirebaseStub = cy.stub(addDisasterUtil, 'updateLayersInFirestore');
  });

  it('switches schemas and writes data', () => {
    const layer = {
      'color-function': {
        'current-style': 2,
        'columns': {
          'wings': {'min': 0, 'max': 2, 'values': [0, 1, 2]},
          'legs': {'min': 0, 'max': 100, 'values': [0, 2, 4, 8, 100]},
        },
        'color': 'yellow',
      },
    };
    setDisasterAndLayers([layer]);

    const td = withColor($(document.createElement('td')), layer, property);
    const row = createTrs(1);
    row[0].append(td);

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
    $('#CONTINUOUS-radio').trigger('change');
    expectOneFirebaseWrite();
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
    $('#DISCRETE-radio').trigger('change');
    expectOneFirebaseWrite();
    const discretePropertyPicker = $('#discrete-property-picker');
    expect(getColorFunction()['current-style']).to.equal(1);
    expect(td.children().length).to.equal(0);
    expect(getColorFunction()['field']).to.equal('wings');
    expect(discretePropertyPicker.val()).to.equal('wings');
    const discreteColorPickerList = $('#discrete-color-pickers');
    expect(discreteColorPickerList.children('li').length).to.equal(3);

    // update field
    discretePropertyPicker.val('legs').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction()['field']).to.equal('legs');

    // update discrete color
    expect(getColorFunction()['colors']).to.be.undefined;
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

    td.trigger('click');
    expect(colorFunctionEditor.is(':visible')).to.be.false;
    expect(writeToFirebaseStub).to.not.be.called;
  });
});

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
  return addDisasterUtil.getCurrentLayers()[0][property];
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
