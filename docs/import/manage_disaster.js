import {eeLegacyPathPrefix} from '../ee_paths.js';
import {getDisaster} from '../resources.js';

import {createScoreAssetForFlexibleDisaster, createScoreAssetForStateBasedDisaster, setStatus} from './create_score_asset.js';
import {getDisasterAssetsFromEe,} from './list_ee_assets.js';
import {initializeAddDelete} from './manage_disaster_add_delete.js';
import {disasterData, initializeDamageSelector, SameDisasterChecker, setValidateFunction} from './manage_disaster_base.js';
import {initializeFlexible, onSetFlexibleDisaster, validateFlexibleUserFields} from './manage_disaster_flexible.js';
import {onSetStateBasedDisaster, validateStateBasedUserFields} from './manage_disaster_state_based.js';

export {
  enableWhenReady,
  onSetDisaster,
};
/** @VisibleForTesting */
export {
  createScoreAssetForStateBasedDisaster,
  enableWhenFirestoreReady,
};

// TODO(juliexxia): consolidate asset picker logic and storage structure between
// manage_layers.js and manage_disaster.js
// TODO: refactor to avoid as much jumpiness as possible.

/**
 * Enables page functionality.
 * @param {Promise<Map<string, Object>>} allDisastersData Promise with contents
 *     of Firestore for all disasters
 * @return {Promise<void>} See {@link enableWhenFirestoreReady}
 */
function enableWhenReady(allDisastersData) {
  // Eagerly kick off current disaster asset listing before Firestore finishes.
  const currentDisaster = getDisaster();
  if (currentDisaster) {
    getDisasterAssetsFromEe(currentDisaster);
  }
  return allDisastersData.then(enableWhenFirestoreReady);
}

/**
 * Enables all Firestore-dependent functionality.
 * @param {Map<string, Object>} allDisastersData Contents of
 *     Firestore for all disasters, the current disaster's data is used when
 *     calculating
 * @return {Promise<void>} See {@link onSetDisaster}
 */
function enableWhenFirestoreReady(allDisastersData) {
  for (const [key, val] of allDisastersData) {
    disasterData.set(key, val);
  }
  initializeAddDelete();
  initializeFlexible();

  const processButton = $('#process-button');
  processButton.prop('disabled', false);
  processButton.on('click', () => {
    // Disable button to avoid over-clicking. User can reload page if needed.
    processButton.prop('disabled', true);
    const currentData = disasterData.get(getDisaster());
    if (isFlexible(currentData)) {
      createScoreAssetForFlexibleDisaster(currentData);
    } else {
      createScoreAssetForStateBasedDisaster(currentData);
    }
  });

  return onSetDisaster();
}

/**
 * We track whether or not we've already completed the EE asset-fetching
 * promises for the current disaster. This ensures we don't re-initialize if the
 * user switches back and forth to this disaster while still loading: the second
 * set of promises to complete will do nothing.
 *
 * We don't just use a generation counter (cf. snackbar/toast.js) because when
 * switching from disaster A to B back to A, the first set of promises for A is
 * still valid if they return after we switch back to A.
 */
let processedCurrentDisasterDamageSelector = false;

const damageStatusChecker = new SameDisasterChecker();

/**
 * Function called when current disaster changes. Responsible for displaying the
 * score selectors and enabling/disabling the kick-off button.
 * @return {Promise<void>} Promise that completes when all score parameter
 *     display is done (user can interact with page)
 */
async function onSetDisaster() {
  const currentDisaster = getDisaster();
  if (!currentDisaster) {
    // We don't expect this to happen, because a disaster should always be
    // returned by getDisaster(), but tolerate.
    return Promise.resolve();
  }
  damageStatusChecker.reset();
  const currentData = disasterData.get(currentDisaster);
  const flexible = isFlexible(currentData);
  const validateFunction =
      flexible ? validateFlexibleUserFields : validateStateBasedUserFields;
  setValidateFunction(validateFunction);
  const {assetData} = currentData;

  // Kick off score asset processing.
  const scorePromise = flexible ? onSetFlexibleDisaster(assetData) :
                                  onSetStateBasedDisaster(assetData);
  let disasterAssets;
  try {
    disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  } catch (err) {
    if (!damageStatusChecker.markDoneIfStillValid()) {
      // Don't display errors to user if no longer current disaster.
      return;
    }
    if (err &&
        err !==
            'Asset "' + eeLegacyPathPrefix + currentDisaster + '" not found.') {
      setStatus(err);
    }
    disasterAssets = new Map();
  }
  if (!damageStatusChecker.markDoneIfStillValid()) {
    // Don't do anything unless this is still the right disaster.
    return;
  }
  initializeDamageSelector(disasterAssets);
  processedCurrentDisasterDamageSelector = true;
  await scorePromise;
  validateFunction();
}

function isFlexible(disasterData) {
  return !!disasterData.assetData.flexibleData;
}
