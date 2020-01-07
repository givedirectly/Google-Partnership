import {ColorStyle, LayerType} from '../../../docs/firebase_layers';
import {readDisasterDocument} from '../../../docs/firestore_document';
import {populateColorFunctions, withColor} from '../../../docs/import/color_function_util.js';
import * as manageLayersLib from '../../../docs/import/manage_layers_lib.js';
import {getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import * as snackbar from '../../../docs/snackbar.js';
import {createTrs, setDisaster, setDisasterAndLayers} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const property = 'colorFunction';
let writeToFirebaseStub;

describe('Unit tests for color function utility', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  let colorFunctionEditor;
  let snackbarStub;

  before(() => {
    cy.visit('test_utils/empty.html');
    return cy.document().then((doc) => {
      colorFunctionEditor = doc.createElement('div');
      colorFunctionEditor.id = 'color-fxn-editor';
      colorFunctionEditor.hidden = true;
      const colorTypeRadios = doc.createElement('div');
      colorTypeRadios.append(
          ...makeRadio(doc, 'SINGLE-radio', 'property-or-single'),
          ...makeRadio(doc, 'property-radio', 'property-or-single'));
      colorFunctionEditor.append(colorTypeRadios);
      const byPropertyDiv = makeTypeDiv(doc, 'by-property');
      const propertyPicker = doc.createElement('select');
      propertyPicker.id = 'property-picker';
      byPropertyDiv.append(
          propertyPicker, doc.createElement('br'),
          ...makeRadio(doc, 'CONTINUOUS-radio', 'by-property-type'),
          ...makeRadio(doc, 'DISCRETE-radio', 'by-property-type'),
          makeTypeDiv(doc, 'continuous'), makeTypeDiv(doc, 'discrete'));
      colorFunctionEditor.append(makeTypeDiv(doc, 'single'), byPropertyDiv);
      doc.body.appendChild(colorFunctionEditor);
    });
  });

  let first = true;
  beforeEach(() => {
    snackbarStub = cy.stub(snackbar, 'showErrorSnackbar');
    cy.document().then((doc) => {
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      // We only need this to run once but stubs are supposed to be set
      // in beforeEach not before.
      if (first) {
        populateColorFunctions();
        first = false;
      }
    });
    writeToFirebaseStub = cy.stub(manageLayersLib, 'updateLayersInFirestore');
    $(colorFunctionEditor).hide();
  });

  it('closes an incomplete color function form', () => {
    let td = setUpWithLayer({
      colorFunction: {
        currentStyle: 0,
        columns: {
          wings: {min: 0, max: 100, values: [0, 1, 2, 100]},
        },
      },
    });
    td.trigger('click');
    td.trigger('click');
    expect(snackbarStub.withArgs(
               'Warning: Closed layer missing color and property. ' +
               'May not show up on map.'))
        .to.be.calledOnce;

    const missingColorStub = snackbarStub.withArgs(
        'Warning: Closed layer missing color. May not show up on map.');
    td = setUpWithLayer({
      colorFunction: {
        currentStyle: 2,
      },
    });
    td.trigger('click');
    td.trigger('click');
    expect(missingColorStub).to.be.calledOnce;

    td = setUpWithLayer({
      colorFunction: {
        currentStyle: 0,
        columns: {
          wings: {min: 0, max: 100, values: [0, 1, 2, 100]},
        },
        field: 'wings',
      },
    });
    td.trigger('click');
    td.trigger('click');
    expect(missingColorStub).to.be.calledTwice;

    td = setUpWithLayer({
      colorFunction: {
        currentStyle: 0,
        columns: {
          wings: {min: 0, max: 100, values: [0, 1, 2, 100]},
        },
        color: 'red',
      },
    });
    td.trigger('click');
    td.trigger('click');
    expect(
        snackbarStub.withArgs(
            'Warning: Closed layer missing property. May not show up on map.'))
        .to.be.calledOnce;

    td = setUpWithLayer({
      colorFunction: {
        currentStyle: 1,
        columns: {
          wings: {min: 0, max: 100, values: [0, 1, 2, 100]},
        },
        field: 'wings',
        colors: {},
      },
    });
    td.trigger('click');
    td.trigger('click');
    expect(snackbarStub.withArgs(
               'Warning: Closed layer missing at least one color. ' +
               'May not show up on map.'))
        .to.be.calledOnce;
  });

  it('updates min-max values', () => {
    // layer in pre-picking a property state
    const layer = {
      colorFunction: {
        currentStyle: 0,
        columns: {
          wings: {min: 0, max: 100, values: [0, 1, 2, 100]},
        },
      },
    };
    const td = setUpWithLayer(layer);
    td.trigger('click');
    const minMax = $('#min-max');
    expect(minMax).not.to.be.visible;
    
    $('#property-picker').val('wings').trigger('change');
    expectOneFirebaseWrite();
    expect(minMax).to.be.visible;
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
    expect(minMax).to.be.visible;
    expect(maxInput.val()).to.equal('20');
    expect(minInput.val()).to.equal('1');
    const wings = getCurrentLayers()[0].colorFunction.columns.wings;
    expect(wings.min).to.equal(1);
    expect(wings.max).to.equal(20);

    // try to input a bad val (min < max)
    const errorDiv = $('#max-min-error');
    expect(errorDiv).not.to.be.visible;
    minInput.val(30).trigger('blur');
    expect(errorDiv).to.be.visible;
    expect(errorDiv.text()).to.equal('Error: min value > max value');
    expect(writeToFirebaseStub).to.not.be.called;
    minInput.val(10).trigger('blur');
    expect(errorDiv).not.to.be.visible;
    expectOneFirebaseWrite();
  });

  it.only('tests against real harvey layer', () => {
    setDisaster('2017-harvey');
    readDisasterDocument().then((doc) => {
      const {layerArray} = doc.data();
      let featureCollectionLayer;
      for (const layer of layerArray) {
        if (layer.assetType === LayerType.FEATURE_COLLECTION) {
          featureCollectionLayer = layer;
          break;
        }
      }
      if (!featureCollectionLayer) {
        // If harvey ends up with no feature collection-typed layers we
        // return early. Don't expect this to happen but.
        return;
      }

      const {colorFunction} = featureCollectionLayer;
      const {color, field, colors} = colorFunction;

      const td = setUpWithLayer(featureCollectionLayer);
      td.trigger('click');

      switch (colorFunction.currentStyle) {
        case ColorStyle.CONTINUOUS:
          expect($('#property-picker').val()).to.equal(field);
          expect($('#continuous-min').val())
              .to.equal(colorFunction.columns[field].min);
          expect($('#continuous-max').val())
              .to.equal(colorFunction.columns[field].max);
          if (color) {
            expect($('#continuous-color-picker').val()).to.equal(color);
          } else {
            expect($('#continuous-color-picker').val()).to.be.null;
          }
          break;
        case ColorStyle.DISCRETE:
          expect($('#property-picker').val()).to.equal(field);
          $('#discrete-color-pickers')
              .find('li')
              .each(/* @this HTMLElement */ function() {
                // slicing off the ': ' at the end of the label to just get the
                // property value.
                const value = $(this).children('label').text().slice(0, -2);
                const selectedColor = $(this).children('select').val();
                expect(colors[value]).to.equal(selectedColor);
              });
          break;
        case ColorStyle.SINGLE:
          if (color) {
            expect($('#single-color-picker').val()).to.equal(color);
          } else {
            expect($('#single-color-picker').val()).to.be.null;
          }
          break;
      }
    });
  });

  it('switches schemas and writes data', () => {
    const layer = {
      colorFunction: {
        currentStyle: 2,
        lastByPropertyStyle: 0,
        columns: {
          wings: {min: 0, max: 2, values: [0, 1, 2]},
          legs: {min: 0, max: 100, values: [0, 2, 4, 8, 100]},
        },
        colors: {},
        color: 'yellow',
      },
    };
    const td = setUpWithLayer(layer);
    expect($(colorFunctionEditor)).not.to.be.visible;
    td.trigger('click');

    expect($(colorFunctionEditor)).to.be.visible;
    expect(writeToFirebaseStub).to.not.be.called;
    expect(getColorFunction().color).to.equal('yellow');

    // update color
    $('#single-color-picker').val('red').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction().color).to.equal('red');
    expect(td.children().length).to.equal(1);
    expect(td.children().first().css('background-color')).to.equal('red');

    // switch to continuous
    const propertyRadio = $('#property-radio');
    propertyRadio.trigger('change');
    expectOneFirebaseWrite();

    const continuousRadio = $('#CONTINUOUS-radio');
    expect(continuousRadio.prop('checked')).to.be.true;
    expect(continuousRadio.prop('style').display).to.equal('');
    const propertyPicker = $('#property-picker');
    expect(propertyPicker.val()).to.be.null;
    let {currentStyle, color} = getColorFunction();
    expect(currentStyle).to.equal(0);
    expect(color).to.equal('red');

    // update field
    propertyPicker.val('wings').trigger('change');
    expectOneFirebaseWrite();
    expect(getColorFunction().field).to.equal('wings');
    expect($('#continuous-color-picker').val()).to.equal('red');

    // switch to discrete
    const discreteRadio = $('#DISCRETE-radio');
    discreteRadio.trigger('change');
    expectOneFirebaseWrite();
    let field;
    ({currentStyle, field} = getColorFunction());
    expect(currentStyle).to.equal(1);
    // single empty box when no discrete colors have been chosen.
    expect(td.children().length).to.equal(1);
    expect(field).to.equal('wings');
    expect(propertyPicker.val()).to.equal('wings');
    const discreteColorPickerList = $('#discrete-color-pickers');
    expect(discreteColorPickerList.children('li').length).to.equal(3);

    // update field
    propertyPicker.val('legs').trigger('change');
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

    // switch to single and back to check state was saved
    $('#SINGLE-radio').trigger('change');
    expectOneFirebaseWrite();
    propertyRadio.trigger('change');
    expectOneFirebaseWrite();
    expect(discreteRadio.prop('checked')).to.be.true;

    td.trigger('click');
    expect($(colorFunctionEditor)).not.to.be.visible;
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

  // We're not actually attaching this and grabbing it again so fine to use
  // non-cy doc.
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
 * @param {HTMLDocument} doc
 * @param {string} id
 * @return {HTMLDivElement}
 */
function makeTypeDiv(doc, id) {
  const div = doc.createElement('div');
  div.id = id;
  div.hidden = true;
  return div;
}

/**
 * Makes a radio (mimicking html in manage-layers.html). Add a label for
 * easier test debugging.
 * @param {HTMLDocument} doc
 * @param {string} id
 * @param {string} name
 * @return {HTMLInputElement}
 */
function makeRadio(doc, id, name) {
  const label = doc.createElement('label');
  label.innerText = id;
  const radio = doc.createElement('input');
  radio.id = id;
  radio.name = name;
  radio.type = 'radio';
  return [label, radio];
}
