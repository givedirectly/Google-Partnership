import {ColorStyle} from '../../../docs/firebase_layers.js';
import * as addDisasterUtil from '../../../docs/import/add_disaster_util.js';
import {populateColorFunctions, setColor, setDiscreteColor, setGlobalTd, setProperty, switchSchema, withColor} from '../../../docs/import/color_function_util.js';
import {createTrs, setDisasterAndLayers} from '../../support/import_test_util.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

let writeToFirebaseStub;

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();

  const property = 'color-function';

  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));

    const colorFunctionEditor =
        $(document.createElement('div')).prop('id', 'color-fxn-editor').hide();
    colorFunctionEditor.append(
        makeTypeDiv('single'), makeTypeDiv('continuous'),
        makeTypeDiv('discrete'));
    $(document.body).append(colorFunctionEditor);

    populateColorFunctions();

    function makeTypeDiv(id) {
      return $(document.createElement('div'))
          .prop('id', id)
          .hide()
          .addClass('color-type-div');
    }
  });

  beforeEach(() => {
    writeToFirebaseStub = cy.stub(addDisasterUtil, 'updateLayersInFirestore');
  });

  it('switches schemas', () => {
    const layer = {
      'color-function': {
        'current-style': 2,
        'columns': {
          'wings': {'min': 0, 'max': 2, 'values': [0, 1, 2]},
          'legs': {'min': 0, 'max': 100, 'values': [0, 2, 4, 8, 100]}
        },
        'color': 'yellow',
      }
    };
    setDisasterAndLayers([layer]);

    const td = withColor($(document.createElement('td')), layer, property);
    setGlobalTd(td);
    const row = createTrs(1);
    row[0].append(td);

    // switch to single
    switchSchema(ColorStyle.SINGLE);
    expect(getColorFunction()['color']).to.equal('yellow');

    // update color
    setColor($('#single-color-picker').val('red'));
    expect(getColorFunction()['color']).to.equal('red');
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('red');

    // switch to continuous
    switchSchema(ColorStyle.CONTINUOUS);
    const continuousPropertyPicker = $('#continuous-property-picker');
    expect(getColorFunction()['current-style']).to.equal(0);
    expect(continuousPropertyPicker.val()).to.be.null;

    // update field
    setProperty(continuousPropertyPicker.val('wings'));
    expect(getColorFunction()['field']).to.equal('wings');

    // switch to discrete
    switchSchema(ColorStyle.DISCRETE);
    const discretePropertyPicker = $('#discrete-property-picker');
    expect(getColorFunction()['current-style']).to.equal(1);
    expect(td.children().length).to.equal(0);
    expect(discretePropertyPicker.val()).to.equal('wings');
    const discreteColorPickerList = $('#discrete-color-pickers');
    expect(discreteColorPickerList.children('li').length).to.equal(3);

    // update field
    setProperty(discretePropertyPicker.val('legs'));
    expect(getColorFunction()['field']).to.equal('legs');

    // update discrete color
    setDiscreteColor(
        discreteColorPickerList.children('li').first().children('select').val(
            'orange'));
    expect(getColorFunction()['colors']).to.eql({'0': 'orange'});
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('orange');

    // update another
    setDiscreteColor(
        discreteColorPickerList.children().eq(1).children('select').val(
            'blue'));
    expect(td.children().length).to.equal(2);
    expect(td.children().eq(1).css('background-color')).to.equal('blue');
  });

  function getColorFunction() {
    return addDisasterUtil.getCurrentLayers()[0][property];
  }
});