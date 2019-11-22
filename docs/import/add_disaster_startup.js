import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {colorMap} from '../firebase_layers.js';
import {loadNavbarWithTitle} from '../navbar.js';
import SettablePromise from '../settable_promise.js';
import TaskAccumulator from '../task_accumulator.js';

import {enableWhenReady, toggleState, updateAfterSort} from './add_disaster.js';

export {taskAccumulator};

// 2 tasks: EE authentication, page load, firebase is ready.
const taskAccumulator = new TaskAccumulator(3, enableWhenReady);

// TODO: do something with this promise, pass it somewhere - probably once
// tagging happens.
const firebaseAuthPromise = new SettablePromise();
firebaseAuthPromise.getPromise().then(() => taskAccumulator.taskCompleted());
const authenticator = new Authenticator(
    (token) => firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
    () => {
      // Necessary for listAssets.
      ee.data.setCloudApiEnabled(true);
      taskAccumulator.taskCompleted();
    });
authenticator.start();

$('#create-new-disaster').on('click', () => toggleState(false));
$('#cancel-new-disaster').on('click', () => toggleState(true));

$('#tbody').sortable({
  revert: true,
  update: (event, ui) => updateAfterSort(ui),
  helper: (e, tr) => {
    const originals = tr.children();
    const helper = tr.clone();
    // Set helper cell sizes to match the original sizes so when being dragged
    // entire row maintains original width.
    helper.children().each(/* @this HTMLElement */ function(index) {
      $(this).width(originals.eq(index).width());
    });
    return helper;
  },
});

function createRadioFor(colorType) {
  const buttonAndLabel = [];
  buttonAndLabel.push($(document.createElement('input')).attr({
    name: 'color-type',
    type: 'radio',
    id: colorType + '-radio',
    value: colorType,
  }));
  buttonAndLabel.push($(document.createElement('label'))
                          .prop('for', colorType + 'radio')
                          .text(colorType));
  buttonAndLabel.push($(document.createElement('span')).text('  '));
  return buttonAndLabel;
}

const colorFunctionDiv = $('#color-fxn-editor');
colorFunctionDiv.prepend(createRadioFor('single-color'));
colorFunctionDiv.prepend(createRadioFor('discrete'));
colorFunctionDiv.prepend(createRadioFor('continuous'));

function createColorPicker() {
  const colorPicker = $(document.createElement('select'));
  colorMap.forEach((value, key) => {
    const option = $(document.createElement('option')).val(key).text(key);
    colorPicker.append(option);
  });
  return colorPicker;
}

const label = $(document.createElement('label'))
                  .prop('for', 'single-color-picker')
                  .text('color: ');
const singleColorPicker = createColorPicker().prop('id', 'single-color-picker');
singleColorPicker.on('change', () => {
  getRowIndex(singleColorPicker.parents('tr'))
})
$('#single').append(label, singleColorPicker);

loadNavbarWithTitle('Add disaster');
