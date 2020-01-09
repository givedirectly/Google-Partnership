import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {showError} from '../error.js';
import {disasterCollectionReference} from '../firestore_document.js';

import {createDisasterData} from './create_disaster_lib.js';
import {setStatus} from './create_score_asset.js';
import {disasterData} from './manage_disaster_base.js';

export {addDisaster, deleteDisaster, initializeAddDelete, toggleState};
// For testing.
export {writeNewDisaster};

function initializeAddDelete() {
  // enable add disaster button.
  const addDisasterButton = $('#add-disaster-button');
  addDisasterButton.prop('disabled', false);
  addDisasterButton.on('click', addDisaster);

  // Enable delete button.
  const deleteButton = $('#delete');
  deleteButton.prop('disabled', false);
  deleteButton.on('click', deleteDisaster);
}

/**
 * Deletes a disaster from firestore. Confirms first. Returns when deletion is
 * complete (or instantly if deletion doesn't actually happen).
 *
 * TODO(janakr): If a slow write from {@link updateDataInFirestore} happens to
 *  lose to this delete, the doc will be recreated, which isn't great. Could
 *  maybe track all pending write promises and chain this one off of them, or
 *  disable delete button until all pending writes were done (might be good to
 *  give user an indication like that).
 * @return {Promise<void>}
 */
function deleteDisaster() {
  const disasterPicker = $('#disaster-dropdown');
  const disasterId = disasterPicker.val();
  if (confirm('Delete ' + disasterId + '? This action cannot be undone')) {
    disasterData.delete(disasterId);
    // Don't know how to get a select element's "options" field in jQuery.
    disasterPicker[0].remove(disasterPicker[0].selectedIndex);
    const newOption = disasterPicker.children().eq(0);
    disasterPicker.val(newOption.val()).trigger('change');
    return disasterCollectionReference().doc(disasterId).delete();
  }
  return Promise.resolve();
}

/**
 * Onclick function for submitting the new disaster form. Writes new disaster
 * to firestore, local disasters map and disaster picker. Doesn't allow name,
 * year or states to be empty fields.
 * @return {Promise<boolean>} resolves true if new disaster was successfully
 *     written.
 */
function addDisaster() {
  const year = $('#year').val();
  const name = $('#name').val();
  let states = $('#states').val();

  if (!year || !name) {
    setStatus('Error: Disaster name and year are required.');
    return Promise.resolve(false);
  }
  if ($('#disaster-type-flexible').is(':checked')) {
    states = null;
  } else if (!states) {
    setStatus('Error: states are required for Census-based disaster.');
    return Promise.resolve(false);
  }
  if (isNaN(year)) {
    setStatus('Error: Year must be a number.');
    return Promise.resolve(false);
  }
  if (notAllLowercase(name)) {
    setStatus(
        'Error: disaster name must be comprised of only lowercase letters');
    return Promise.resolve(false);
  }
  const disasterId = year + '-' + name;
  return writeNewDisaster(disasterId, states);
}

/**
 * Writes the given details to a new disaster entry in firestore. Fails if
 * there is an existing disaster with the same details or there are errors
 * writing to EarthEngine or Firestore. Tells the user in all failure cases.
 *
 * @param {string} disasterId of the form <year>-<name>
 * @param {?Array<string>} states array of states (abbreviations) or null if
 *     this is not a state-based disaster
 * @return {Promise<boolean>} Returns true if EarthEngine folders created
 *     successfully and Firestore write was successful
 */
async function writeNewDisaster(disasterId, states) {
  if (disasterData.has(disasterId)) {
    setStatus('Error: disaster with that name and year already exists.');
    return false;
  }
  setStatus('');
  const eeFolderPromises =
      [getCreateFolderPromise(eeLegacyPathPrefix + disasterId)];
  if (states) {
    states.forEach(
        (state) => eeFolderPromises.push(
            getCreateFolderPromise(legacyStateDir + '/' + state)));
  }

  const tailError = '" You can try refreshing the page';
  // Wait on EE folder creation to do the Firestore write, since if folder
  // creation fails we don't want to have to undo the write.
  try {
    await Promise.all(eeFolderPromises);
  } catch (err) {
    showError('Error creating EarthEngine folders: "' + err + tailError);
    return false;
  }

  const currentData = createDisasterData(states);
  try {
    await disasterCollectionReference().doc(disasterId).set(currentData);
  } catch (err) {
    const message = err.message ? err.message : err;
    showError('Error writing to Firestore: "' + message + tailError);
    return false;
  }

  disasterData.set(disasterId, currentData);

  const disasterPicker = $('#disaster-dropdown');
  let added = false;
  // We expect this recently created disaster to go near the top of the list, so
  // do a linear scan down.
  // Note: let's hope this tool isn't being used in the year 10000.
  // Comment needed to quiet eslint.
  disasterPicker.children().each(/* @this HTMLElement */ function() {
    if ($(this).val() < disasterId) {
      $(document.createElement('option'))
          .text(disasterId)
          .insertBefore($(this));
      added = true;
      return false;
    }
  });
  if (!added)
    disasterPicker.append($(document.createElement('option')).text(disasterId));
  toggleState(true);

  disasterPicker.val(disasterId).trigger('change');
  return true;
}

/**
 * Returns a promise that resolves on the creation of the given folder.
 * TODO: add status bar for when this is finished.
 *
 * @param {string} dir asset path of folder to create
 * @return {Promise<void>} resolves when after the directory is created and
 * set to world readable.
 */
function getCreateFolderPromise(dir) {
  return new Promise(
      (resolve, reject) =>
          ee.data.createFolder(dir, false, (result, failure) => {
            if (failure && !failure.startsWith('Cannot overwrite asset ')) {
              reject(failure);
              return;
            }
            ee.data.setAssetAcl(
                dir, {all_users_can_read: true}, (result, failure) => {
                  if (failure) {
                    reject(failure);
                    return;
                  }
                  resolve(result);
                });
          }));
}

/**
 * Returns true if the given string is *not* all lowercase letters.
 * @param {string} val
 * @return {boolean}
 */
function notAllLowercase(val) {
  return !/^[a-z]+$/.test(val);
}

/**
 * Changes page state between looking at a known disaster and adding a new one.
 * @param {boolean} known
 */
function toggleState(known) {
  if (known) {
    $('#create-new-disaster').show();
    $('#new-disaster').hide();
    $('#current-disaster-interaction').show();
  } else {
    $('#create-new-disaster').hide();
    $('#new-disaster').show();
    $('#current-disaster-interaction').hide();
  }
}
