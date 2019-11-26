import * as addDisasterUtil from '../../../docs/import/add_disaster_util.js';
import {populateColorFunctions, setGlobalTd, withColor} from '../../../docs/import/color_function_util.js';
import {createTrs, setDisasterAndLayers} from '../../support/import_test_util.js';
import {addFirebaseHooks, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  addFirebaseHooks();

  const property = 'color-function';
  let colorFunctionEditor;
  let writeToFirebaseStub;

  before(() => {
    cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));

    colorFunctionEditor =
        $(document.createElement('div')).prop('id', 'color-fxn-editor').hide();
    colorFunctionEditor.append(
        makeTypeDiv('single'), makeTypeDiv('continuous'),
        makeTypeDiv('discrete'));
    $(document.body).append(colorFunctionEditor);

    populateColorFunctions();

    /**
     * Makes one of the type divs (mimicking html in add_disaster.html)
     * @param {string} id
     * @return {JQuery<HTMLDivElement>}
     */
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
    expect(writeToFirebaseStub).to.be.calledOnce;
    expect(getColorFunction()['color']).to.equal('yellow');

    // update color
    $('#single-color-picker').val('red').trigger('change');
    expect(writeToFirebaseStub).to.be.calledTwice;
    expect(getColorFunction()['color']).to.equal('red');
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('red');

    // switch to continuous
    $('#CONTINUOUS-radio').trigger('change');
    expect(writeToFirebaseStub).to.be.calledThrice;
    const continuousPropertyPicker = $('#continuous-property-picker');
    expect(getColorFunction()['current-style']).to.equal(0);
    expect(continuousPropertyPicker.val()).to.be.null;

    // update field
    continuousPropertyPicker.val('wings').trigger('change');
    expect(writeToFirebaseStub).to.be.callCount(4);
    expect(getColorFunction()['field']).to.equal('wings');

    // switch to discrete
    $('#DISCRETE-radio').trigger('change');
    expect(writeToFirebaseStub).to.be.callCount(5);
    const discretePropertyPicker = $('#discrete-property-picker');
    expect(getColorFunction()['current-style']).to.equal(1);
    expect(td.children().length).to.equal(0);
    expect(discretePropertyPicker.val()).to.equal('wings');
    const discreteColorPickerList = $('#discrete-color-pickers');
    expect(discreteColorPickerList.children('li').length).to.equal(3);

    // update field
    discretePropertyPicker.val('legs').trigger('change');
    expect(writeToFirebaseStub).to.be.callCount(6);
    expect(getColorFunction()['field']).to.equal('legs');

    // update discrete color
    discreteColorPickerList.children('li')
        .first()
        .children('select')
        .val('orange')
        .trigger('change');
    expect(writeToFirebaseStub).to.be.callCount(7);
    expect(getColorFunction()['colors']).to.eql({'0': 'orange'});
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('orange');

    // update another
    discreteColorPickerList.children()
        .eq(1)
        .children('select')
        .val('blue')
        .trigger('change');
    expect(writeToFirebaseStub).to.be.callCount(8);
    expect(td.children().length).to.equal(2);
    expect(td.children().eq(1).css('background-color')).to.equal('blue');

    td.trigger('click');
    expect(colorFunctionEditor.is(':visible')).to.be.false;
  });

  /**
   * Gets the current color function.
   * @return {Object}
   */
  function getColorFunction() {
    return addDisasterUtil.getCurrentLayers()[0][property];
  }
});
