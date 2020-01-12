import {getDisaster} from '../resources.js';

import {
  createScoreAssetForFlexibleDisaster,
  createScoreAssetForStateBasedDisaster
} from './create_score_asset.js';
import {getDisasterAssetsFromEe,} from './list_ee_assets.js';
import {initializeAddDelete} from './manage_disaster_add_delete.js';
import {
  disasterData,
  getIsCurrentDisasterChecker,
  initializeDamageSelector,
  isFlexible,
  noteNewDisaster,
} from './manage_disaster_base.js';
import {
  initializeFlexible,
  onSetFlexibleDisaster,
  validateFlexibleUserFields
} from './manage_disaster_flexible.js';
import {
  onSetStateBasedDisaster,
  validateStateBasedUserFields
} from './manage_disaster_state_based.js';

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
 * Function called when current disaster changes. Responsible for displaying the
 * score selectors and enabling/disabling the kick-off button.
 * @return {Promise<void>} Promise that completes when all score parameter
 *     display is done (user can interact with page)
 */
async function onSetDisaster() {
  noteNewDisaster();
  const isCurrent = getIsCurrentDisasterChecker();
  const currentDisaster = getDisaster();
  if (!currentDisaster) {
    // We don't expect this to happen, because a disaster should always be
    // returned by getDisaster(), but tolerate.
    return Promise.resolve();
  }
  const currentData = disasterData.get(currentDisaster);
  const flexible = isFlexible(currentData);
  const {assetData} = currentData;

  // Kick off score asset processing.
  const scorePromise = flexible ? onSetFlexibleDisaster(assetData) :
                                  onSetStateBasedDisaster(assetData);
  await initializeDamageSelector();
  await scorePromise;
  if (isCurrent() && !flexible) {
    validateStateBasedUserFields();
  }
}

