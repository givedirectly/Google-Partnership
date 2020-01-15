import {showError} from '../error.js';
import {getDisaster} from '../resources.js';
import {BuildingSource} from './create_disaster_lib.js';
import {getDisasterAssetsFromEe} from './list_ee_assets.js';
import {capitalizeFirstLetter, checkDamageFieldsAndShowKickoffButton, continueMessage, createListForAsset, createSelect, createSelectListItemFromColumnInfo, createSelectWithSimpleWriteOnChange, damageAssetPresent, getAssetsAndSetOptionsForSelect, getPageValueOfPath, getStoredValueFromPath, handleAssetDataChange, isFlexible, maybeShowNoDamageValueItem, NODAMAGE_COLUMN_INFO, NODAMAGE_VALUE_INFO, setExplanationSpanTextForColumn, setOptionsForSelect, showListForAsset, showPendingKickoffButton, showSelectAsPending, validateColumnPathHasValue, verifyAsset, writeAssetDataLocally, writeSelectAndGetPropertyNames} from './manage_disaster_base.js';

export {
  initializeFlexibleDisaster,
  PendingChecker,
  setUpFlexibleOnPageLoad,
  useDamageForBuildings,
  validateFlexibleUserFields,
};
// For testing.
export {componentsData, POVERTY_BUILDINGS_PATH};

const PendingState = Object.freeze({
  NOT_PENDING: 0,
  PENDING: 1,
  PENDING_BUT_INVISIBLE: 2,
});

/**
 * Utility to note start/end of asynchronous operations that should delay
 * validation. Needed because if user switches the disaster or asset value,
 * currently pending operations may no longer be needed. For instance, if we are
 * waiting for a disaster listing and the user changes the disaster, we'll
 * immediately start waiting for the new disaster's listing. The old disaster
 * listing status is irrelevant. When the first disaster was initialized, we
 * called {@link maybeStartPending}, which triggered a "pending" status. When
 * the new disaster initializes, we call it again. Because the first call had
 * not finished, we don't increment the pending count. Whenever the first call
 * finishes, it will not call {@link countDownPendingOperations}: only the
 * current disaster is allowed to do that.
 *
 * Similarly, if an asset value changes, we'll immediately kick off a query for
 * the new values' columns. If the old value column query had not completed, we
 * don't increment the pending count.
 *
 * There should be one `PendingChecker` for each operation that must finish
 * before validation can run, but which can be rendered irrelevant by a user
 * action. Thus, each select whose value cascades (poverty, geography, damage,
 * buildings) must have a `PendingChecker`. Similarly disaster initialization as
 * a whole has a `PendingChecker`. This keeps our count of pending operations
 * limited to the types of operations there can be, which is correct: the user
 * can never be waiting on more than one operation of a given type (like column
 * retrieval for the geography asset).
 *
 * A subtle issue arises when a pending value becomes unnecessary: for instance,
 * if the div that needs to be populated is hidden. Then we immediately count
 * down the pending operations via {@link markInvisible}. But if the div ever
 * becomes visible again, and the operation has still not finished, we count
 * pending operations back up using {@link markVisible}. This allows listings to
 * complete in the background and be ready, even if the user is switching other
 * options back and forth.
 */
class PendingChecker {
  pending = PendingState.NOT_PENDING;

  /** @return {boolean} False if this checker was already pending */
  maybeStartPending() {
    if (!isFlexible()) {
      return true;
    }
    switch (this.pending) {
      case PendingState.NOT_PENDING:
        this.pending = PendingState.PENDING;
        startPendingOperation();
        return true;
      case PendingState.PENDING:
        return false;
      case PendingState.PENDING_BUT_INVISIBLE:
        showError(
            'Must call markVisible() on invisible element before pending op',
            'Error validating inputs: please reload page');
        return false;
    }
  }

  /**
   * Notes that the data source this tracks has finished its pending operation.
   * Must only be called if the data is still valid. Should be called after
   * display of the data is done (so, at end of {@link setOptionsForColumns}).
   */
  finishPending() {
    if (!isFlexible()) {
      return;
    }
    switch (this.pending) {
      case PendingState.NOT_PENDING:
        showError('Error validating inputs: please reload page');
        return;
      case PendingState.PENDING:
        countDownPendingOperations();
        // Fall through.
      case PendingState.PENDING_BUT_INVISIBLE:
        this.pending = PendingState.NOT_PENDING;
    }
  }

  /** See class doc. */
  markInvisible() {
    if (this.pending === PendingState.PENDING) {
      this.pending = PendingState.PENDING_BUT_INVISIBLE;
      countDownPendingOperations();
    }
  }

  /** See class doc. */
  markVisible() {
    if (this.pending === PendingState.PENDING_BUT_INVISIBLE) {
      this.pending = PendingState.PENDING;
      startPendingOperation();
    }
  }
}

/**
 * Functions for dealing with a "flexible" (non-state-based) disaster.
 *
 * ## Structure of a flexible disaster
 *
 * A flexible disaster takes more general input assets than a state-based one.
 * We expect the following (analogs to the state-based case are in parentheses):
 *
 * 1. A poverty asset, which must have the following columns:
 *      a. Poverty rate (e.g. 'SNAP PERCENTAGE');
 *      b. District identifier (e.g. 'GEOid2');
 *      c. District description (e.g. 'GEOdisplay-label');

 *    If the poverty asset does not have geometries, then we also need:
 * 2. A geography asset, which must have geometries, and the following column
 *    to join to poverty:
 *      a. District identifier (e.g. 'GEOID');
 *
 *    Before damage is present, that is all. With damage, we also need:
 * 3. A building-count source to be specified. Either 'buildings', 'poverty', or
 *    'damage'.
 * 4. If the source is 'buildings', we need a buildings asset. If it has
 *    geometries, it is assumed to have building footprints (like the Microsoft
 *    building footprints, see Data Source Guide) and we count the number in
 *    each district. If it does not (like US Census data), it must have columns:
 *      a. District identifier (e.g. 'GEOid2' for Census buildings data);
 *      b. Building counts column;
 * 5. If the source is 'poverty', the poverty asset must additionally have a
 *    building-counts column.
 * 6. If the source is 'damage', the damage asset must have:
 *      a. A column whose values identify undamaged buildings (like 'descriptio'
 *         for CrowdAI data);
 *      b. The value in that column that identifies undamaged buildings (like
 *         'no-damage' for CrowdAI data).
 *
 * ## Fundamental complications of flexible disasters
 *
 * A flexible disaster has "cascading" values. This means that the value chosen
 * for one input can affect the necessity/visibility of other inputs, or even
 * their potential values. The first case happens when we choose a poverty
 * asset: if that asset's features have geometries, we don't need a geography
 * asset, but if it doesn't, we do. So we only display the geography asset if
 * the poverty asset doesn't have geometries. The second case happens when we
 * need to specify special columns for the asset. We don't calculate the
 * columns until the asset is chosen. We call this feature "cascading" values.
 * Note that the damage asset also has this property, where the no-damage
 * column can only be displayed once the damage asset is selected.
 *
 * ### Validation
 *
 * Because of the delay in the second case, we can't validate user inputs
 * immediately when the value changes. Instead, we have to wait for all pending
 * operations to complete. That way, for instance, if the user has specified
 * that column A is the "poverty rate column", but then changes poverty assets
 * to asset2, which has no column named 'A', we will correctly say that the
 * poverty rate column needs to be set: in Firestore, 'A' is still the value
 * for the poverty rate column, but on the page, it won't be set because A is
 * not present in asset2's columns, which will be what is shown in the select.
 * See "Validation-related functions" below for how to track pending operations.
 *
 * ### Building counts
 *
 * Another complication is the four ways that the building count can be
 * specified: coming from a buildings asset that has building footprints (like
 * the Microsoft data); coming from an asset that has counts per district (like
 * US Census buildings data; coming from the poverty asset itself (might be
 * approximated by total households); or coming from the damage asset (like
 * the asset CrowdAI provides, with both damaged and undamaged buildings).

 * ### Page display
 *
 * When data is not yet available, select elements will show a "pending" state,
 * but their visibility will be based on the last-known data from Firestore, to
 * minimize page jumpiness. All elements are created eagerly, even if they are
 * not visible. This means that the buildings asset select, for instance, is
 * created and initialized (and its column selects are initialized), even if
 * that is not the current source of data for building counts. This normally
 * does not slow the page down, because if no buildings asset is specified, the
 * column selects will not be either.
 *
 * Fields are shown if they have to be specified given the other currently set
 * fields in order to kick off score asset creation. Thus, the poverty rate
 * field is always shown because it is always mandatory, even if the poverty
 * asset itself is not specified. If the asset whose columns populate the select
 * is not specified, the select will have just the option 'None'.
 *
 * If the buildings asset does not have geometries, then we must show column
 * selects for it, but we hide those selects if it has geometries. We use the
 * last-known state there to minimize page jumpiness.
 *
 * This principle extends to the damage asset's columns, but the logic is
 * trickier. The basic logic is described at
 * {@link createNoDamageColumnAndValueList}: Only show no-damage column select
 * if there is a damage asset. Only show no-damage value input if no-damage
 * column select has a value. The exception to this is if we're using the damage
 * asset to get building counts, and the damage asset is specified. In that
 * case, both column and value must be specified, so we show them both, even if
 * the column isn't specified yet. This upholds the principle of showing exactly
 * those fields the user has to fill out.
 *
 * ## Async functions in this file
 *
 * A number of functions are declared async because they wait on the disaster
 * assets listing. However, once the assets are initially loaded, the listing
 * will always be instantly available (since it is cached), so those functions
 * can be called with no fear of actually waiting. They are identified by their
 * return type not being a Promise despite being async.
 */

/**
 * Data for a field that is displayed as part of an asset. For instance, the
 * poverty asset must have a "rate column" specified. Usually corresponds to a
 * select input.
 * @typedef {Object} ColumnInfo
 * @property {string} label Text displayed before the select, and if missing, in
 *     the error message shown to the user.
 * @property {string} explanation Additional explanatory text for this column,
 *     shown in parentheses after the label before the select.
 * @property {PropertyPath} path Path to this field in Firestore.
 */


const BUILDING_SOURCE_PATH = Object.freeze(['flexibleData', 'buildingSource']);
const POVERTY_HAS_GEOMETRY_PATH =
    Object.freeze(['flexibleData', 'povertyHasGeometry']);
const BUILDING_HAS_GEOMETRY_PATH =
    Object.freeze(['flexibleData', 'buildingHasGeometry']);
const POVERTY_BUILDINGS_PATH =
    Object.freeze(['flexibleData', 'povertyBuildingKey']);

const DISTRICT_ID_LABEL = 'district identifier column';
const DISTRICT_ID_EXPLANATION = 'to match with poverty asset\'s';

/**
 * Either 'poverty', 'geography', or 'buildings'.
 * @typedef {string} ScoreInputType
 */

/**
 * @typedef {Object} ScoreInputData
 * @property {PropertyPath} path Path to the actual asset value.
 * @property {JQuery<HTMLDivElement>} div Where this score input is displayed.
 *     Set in {@link setUpFlexibleOnPageLoad}. Do not show/hide this div
 *     directly. See {@link setVisibilityOfDivForKey}.
 * @property {Array<ColumnInfo>} columns Columns associated with this score
 * input.
 * @property {PendingChecker} columnsPending
 */

/**
 * @type {Object}
 * @property {ScoreInputData} poverty
 * @property {ScoreInputData} geography
 * @property {ScoreInputData} buildings
 */
const componentsData = {
  poverty: {
    path: ['flexibleData', 'povertyPath'],
    div: null,
    columns: [
      {label: 'poverty rate column', path: ['flexibleData', 'povertyRateKey']},
      {
        label: 'district description column',
        explanation: 'human-readable description of each region',
        path: ['flexibleData', 'districtDescriptionKey'],
      },
      {
        label: DISTRICT_ID_LABEL,
        explanation: 'typically a number or short string',
        path: ['flexibleData', 'povertyGeoid'],
      },
    ],
    columnsPending: new PendingChecker(),
  },
  geography: {
    path: ['flexibleData', 'geographyPath'],
    div: null,
    columns: [{
      label: DISTRICT_ID_LABEL,
      explanation: DISTRICT_ID_EXPLANATION,
      path: ['flexibleData', 'geographyGeoid'],
    }],
    columnsPending: new PendingChecker(),
  },
  buildings: {
    path: ['flexibleData', 'buildingPath'],
    div: null,
    columns: [
      {
        label: DISTRICT_ID_LABEL,
        explanation: DISTRICT_ID_EXPLANATION,
        path: ['flexibleData', 'buildingGeoid'],
      },
      {
        label: 'building counts column',
        path: ['flexibleData', 'buildingKey'],
      },
    ],
    columnsPending: new PendingChecker(),
  },
};

let povertyBuildingsDiv;

//                   Validation-related functions.

/**
 * As described above, we cannot do validation until all pending operations are
 * complete. We track pending operations by calling {@link
 * startPendingOperation} before doing asynchronous operations. We then
 * call {@link countDownPendingOperations} when we have displayed all data
 * resulting from that asynchronous operation. Note that calling {@link
 * countDownPendingOperations} right after the asynchronous operation is done
 * would not work: we would attempt to validate user fields that have not yet
 * been set, because the data from the asynchronous operation has not yet been
 * displayed.
 *
 * These functions are only called in {@link PendingChecker} objects, to track
 * operations on a per-type basis, so that we are never waiting on two
 * operations of the same type, for instance, if the user switches quickly
 * between two different poverty assets.
 */

let pendingOperations = 0;

/**
 * Notes that a pending operation has started. If no operations were previously
 * pending, calls {@link validateFlexibleUserFields} in order to show the user
 * the new pending status.
 */
function startPendingOperation() {
  if (pendingOperations++ === 0) {
    validateFlexibleUserFields();
  }
}

/**
 * Notes that a pending operation has finished. If all pending operations are
 * done, calls {@link validateFlexibleUserFields} in order to show the user
 * the new definitive status.
 */
function countDownPendingOperations() {
  if (--pendingOperations === 0) {
    validateFlexibleUserFields();
  }
  if (pendingOperations < 0) {
    // Belt and suspenders, and helpful when debugging.
    showError('Problem validating inputs. Please reload page');
  }
}

const MISSING_BUILDINGS_TAIL =
    ' (choose damage asset as buildings source for now if you don\'t need ' +
    'buildings)';

/**
 * Validates user fields, and shows result on kick-off button. If there are
 * still operations pending, just shows a 'Pending...' message and does no
 * validation.
 */
function validateFlexibleUserFields() {
  if (pendingOperations > 0) {
    showPendingKickoffButton();
    return;
  }
  let message = '';
  let optionalMessage = '';
  const povertyAssetName = getPageValueOfPath(componentsData.poverty.path);
  if (povertyAssetName) {
    message = checkColumns(message, 'poverty');
    if (!getStoredValueFromPath(POVERTY_HAS_GEOMETRY_PATH)) {
      const geographyAssetName =
          getPageValueOfPath(componentsData.geography.path);
      if (geographyAssetName) {
        message = checkColumns(message, 'geography');
      } else {
        message = continueMessage(message, 'missing geography asset');
      }
    }
  } else {
    message = continueMessage(message, 'missing poverty asset');
  }
  const buildingSource = getStoredValueFromPath(BUILDING_SOURCE_PATH);
  const hasDamageAsset = damageAssetPresent();
  if (buildingSource === null) {
    if (hasDamageAsset) {
      message =
          continueMessage(message, 'missing choice for building count source');
    } else {
      optionalMessage = 'building counts';
    }
  } else {
    let tailAboutBuildingsWorkaround = false;
    switch (buildingSource) {
      case BuildingSource.BUILDING:
        const buildingAssetName =
            getPageValueOfPath(componentsData.buildings.path);
        if (buildingAssetName) {
          if (!getStoredValueFromPath(BUILDING_HAS_GEOMETRY_PATH)) {
            message = checkColumns(message, 'buildings');
          }
        } else {
          message = continueMessage(message, 'missing buildings asset');
          tailAboutBuildingsWorkaround = !hasDamageAsset;
        }
        break;
      case BuildingSource.POVERTY:
        if (povertyAssetName && !getPageValueOfPath(POVERTY_BUILDINGS_PATH)) {
          message =
              continueMessage(message, 'must specify building-count column');
          tailAboutBuildingsWorkaround = !hasDamageAsset;
        }
        break;
      case BuildingSource.DAMAGE:
        // Normally there's no error if NODAMAGE_COLUMN_INFO is blank, but we
        // need it. If it's not blank, checkDamageFieldsAndShowKickoffButton
        // will display an error if the value is missing, so don't check here.
        if (!getPageValueOfPath(NODAMAGE_COLUMN_INFO.path)) {
          if (hasDamageAsset) {
            message = addColumnArrayErrorsToMessage(
                message, [NODAMAGE_COLUMN_INFO, NODAMAGE_VALUE_INFO], 'damage');
          } else {
            optionalMessage = 'building counts';
          }
        }
        break;
    }
    if (tailAboutBuildingsWorkaround) {
      message += MISSING_BUILDINGS_TAIL;
    }
  }
  checkDamageFieldsAndShowKickoffButton(message, optionalMessage);
}

/**
 * Calls {@link addColumnArrayErrorsToMessage} with columnInfos from `key`.
 * @param {string} message
 * @param {ScoreInputType} key
 * @return {string}
 */
function checkColumns(message, key) {
  return addColumnArrayErrorsToMessage(
      message, componentsData[key].columns, key);
}

/**
 * Checks columns in `columnInfos` to make sure they all have values. If not,
 * appends errors to `message`.
 * @param {string} message Current error message
 * @param {Array<ColumnInfo>} columnInfos
 * @param {string|ScoreInputType} scoreInputType String to display in error
 *     message: normally {@link ScoreInputType} but can also be 'damage'
 * @return {string}
 */
function addColumnArrayErrorsToMessage(message, columnInfos, scoreInputType) {
  const missingLabels = validateColumnArray(columnInfos);
  if (missingLabels) {
    return continueMessage(
        message,
        'must specify properties from ' + scoreInputType +
            ' asset: ' + missingLabels);
  }
  return message;
}

/**
 * Checks all `columnInfos` for values, concatenates missing ones' labels.
 * @param {Array<ColumnInfo>} columnInfos
 * @return {string}
 */
function validateColumnArray(columnInfos) {
  return columnInfos.map(validateColumnPathHasValue)
      .filter((c) => c)  // Filter out null elements
      .join(', ');
}

//      Initialization functions: called when switching to a disaster.

// We share a single checker for all initialization functions, because they all
// depend on the same async operation: listing the disaster's assets.
const initializeChecker = new PendingChecker();

/**
 * Initializes page: sets up change handlers for building-source radios and
 * initializes the three {@link ScoreInputType} divs. Starts pending in
 * {@link initializeChecker} before any work is done, and finishes when work is
 * completed, so that all other initialization work can skip calling those
 * functions. This is safe because all initialize* functions are waiting on the
 * same promise, so they will all succeed or detect a disaster change together.
 * @param {AssetData} assetData
 * @return {Promise<void>} Promise that completes when all work is done.
 */
async function initializeFlexibleDisaster(assetData) {
  $('#state-based-disaster-asset-selection-table').hide();
  $('#flexible-data').show();
  const {buildingSource} = assetData.flexibleData;
  if (buildingSource !== null) {
    switch (buildingSource) {
      case BuildingSource.BUILDING:
        onBuildingSourceBuildingsSelected();
        $('#buildings-source-buildings').prop('checked', true);
        break;
      case BuildingSource.POVERTY:
        onBuildingSourcePovertySelected();
        $('#buildings-source-poverty').prop('checked', true);
        break;
      case BuildingSource.DAMAGE:
        onBuildingSourceDamageSelected();
        $('#buildings-source-damage').prop('checked', true);
        break;
    }
  }
  initializeChecker.maybeStartPending();
  const [result] = await Promise.all([
    initializeGeography(),
    initializePoverty(),
    initializeBuildings(),
  ]);
  // Just check one value to see if it succeeded: others must be the same.
  if (result) {
    initializeChecker.finishPending();
  }
}

/**
 * Initializes geography div setup. Creates the necessary select element and
 * list of columns; waits for the list of assets to populate the select; then
 * kicks off request for the list of columns to populate each column select.
 * This is the simplest initializer, because geography has no special cascading
 * effects. The other initializers {@link initializePoverty} and
 * {@link initializeBuildings} do at least this much, but have additional tasks.
 * @return {Promise<boolean>} Promise that completes when disaster listing
 *     finished, false if disaster changed. All initialize* functions have the
 *     same return value
 */
async function initializeGeography() {
  createSelectAndColumns('geography').on('change', onGeographyChange);
  if (await getAssetsAndSetOptionsForSelect(
          componentsData.geography.path, false)) {
    setInitialColumnValues('geography');
    return true;
  } else {
    return false;
  }
}

const POVERTY_BUILDINGS_TEXT = 'Column with building count: ';
/**
 * Initializes poverty-related display. In addition to doing the analog of what
 * {@link initializeGeography} does, there are two complications: geography div
 * visibility is based on poverty asset having geometries, and we must
 * initialize a column select (for the building-count column) in a different
 * div from the standard poverty div.
 * @return {Promise<boolean>} Promise that completes when disaster listing
 *     finished, false if disaster changed. All initialize* functions have the
 *     same return value
 */
async function initializePoverty() {
  const select = createSelectAndColumns('poverty').on(
      'change', () => onPovertyChange(select.val()));
  // Take a guess at what geography visibility will be.
  setGeographyDivVisibility(!getStoredValueFromPath(POVERTY_HAS_GEOMETRY_PATH));
  // Create special column select for building-count column.
  $('#buildings-source-poverty-div')
      .empty()
      .append(POVERTY_BUILDINGS_TEXT)
      .append(createSelectWithSimpleWriteOnChange(POVERTY_BUILDINGS_PATH));
  if (!await getAssetsAndSetOptionsForSelect(componentsData.poverty.path)) {
    // Disaster changed: abort.
    return false;
  }
  // Set actual geography visibility.
  await showGeographyDivBasedOnPoverty(select.val());
  setInitialColumnValues('poverty').then((propertyNames) => {
    if (propertyNames) {
      // Do special column setup, if disaster and select value unchanged.
      setOptionsForPovertyBuildings(propertyNames);
    }
  });
  return true;
}

/**
 * Initializes display related to buildings asset, for the case that the user is
 * specifying a buildings asset to compute building counts. In addition to doing
 * the analog of what {@link initializeGeography} does, there is the
 * complication that we do not show the list of column selects when the asset
 * has geometries, since then we interpret the asset as a collection of building
 * locations.
 * @return {Promise<boolean>} Promise that completes when disaster listing
 *     finished, false if disaster changed. All initialize* functions have the
 *     same return value
 */
async function initializeBuildings() {
  const buildingSelect =
      createSelectAndColumns('buildings')
          .on('change', () => onBuildingsChange(buildingSelect.val()));
  if (getStoredValueFromPath(BUILDING_HAS_GEOMETRY_PATH)) {
    // Hide columns list if we actually expect them not to be shown in the end
    // because the building asset has geometries.
    showListForAsset(false, 'buildings');
  }
  if (!await getAssetsAndSetOptionsForSelect(componentsData.buildings.path)) {
    return false;
  }
  if (await buildingsHasGeometry(buildingSelect.val())) {
    showListForAsset(false, 'buildings');
  } else {
    setInitialColumnValues('buildings');
  }
  return true;
}

/**
 * Called by initializers. Shows pending status for column selects, then gets
 * column names for selected asset from EarthEngine, sets column select values
 * to those values (if disaster unchanged), and returns list of column names.
 * @param {ScoreInputType} key
 * @return {Promise<?Array<EeColumn>>} Null if disaster/select value changed,
 *     callers should abort in that case
 */
async function setInitialColumnValues(key) {
  setPendingForColumns(key);
  const propertyNames = await verifyAsset(componentsData[key].path, []);
  if (propertyNames) {
    setOptionsForColumns(propertyNames, key);
  }
  return propertyNames;
}

//                      Change-handling functions

/**
 * Handles geography asset change. As with {@link initializeGeography}, is the
 * simplest change handler: writes to Firestore, validates asset, and sets the
 * column selects to have the right values.
 * @return {Promise<void>} Promise that completes when all displaying complete
 */
async function onGeographyChange() {
  const propertyNames = await onAssetSelectChange('geography');
  if (propertyNames) {
    setOptionsForColumns(propertyNames, 'geography');
  }
}

/**
 * Handles poverty asset change. In addition to basics similar to
 * {@link onGeographyChange}, shows/hides the geography div (immediately, since
 * whether the poverty asset has geometries is known), and sets up the select
 * for the poverty building-count column.
 * @param {EeFC} povertyAsset
 * @return {Promise<void>} Promise that completes when all displaying complete
 */
async function onPovertyChange(povertyAsset) {
  writeAssetDataLocally(
      await povertyHasGeometry(povertyAsset), POVERTY_HAS_GEOMETRY_PATH);
  await showGeographyDivBasedOnPoverty(povertyAsset);
  const propertyNames = await onAssetSelectChange('poverty');
  if (propertyNames) {
    setOptionsForColumns(propertyNames, 'poverty');
    setOptionsForPovertyBuildings(propertyNames);
  }
}

/**
 * Handles buildings asset change. In addition to basics similar to
 * {@link onGeographyChange}, only shows the available column selects if the
 * buildings asset does not have a geometry (see comment at the top of this file
 * for details).
 * @param {EeFC} buildingsAsset
 * @return {Promise<void>} Promise that completes when all displaying complete
 */
async function onBuildingsChange(buildingsAsset) {
  const hasGeometry = await buildingsHasGeometry(buildingsAsset);
  writeAssetDataLocally(hasGeometry, BUILDING_HAS_GEOMETRY_PATH);
  showListForAsset(!hasGeometry, 'buildings');
  const propertyNamesPromise = onAssetSelectChange('buildings');
  if (hasGeometry) {
    componentsData.buildings.columnsPending.finishPending();
  } else {
    setPendingForColumns('buildings');
    const propertyNames = await propertyNamesPromise;
    if (propertyNames) {
      setOptionsForColumns(propertyNames, 'buildings');
    }
  }
}

/**
 * Handles basic operation of an asset selection change: sets relevant columns
 * to 'pending', writes to Firestore, and returns columns of newly chosen asset.
 * Starts a pending operation via {@link setPendingForColumns}, so callers must
 * finish it if still valid, typically in {@link setOptionsForColumns}.
 * @param {ScoreInputType} key
 * @return {Promise<?Array<EeColumn>>} Null if disaster or value of select
 *    associated to `key` changed during retrieval. Callers should abort then
 */
function onAssetSelectChange(key) {
  setPendingForColumns(key);
  return writeSelectAndGetPropertyNames(componentsData[key].path);
}

/**
 * Shows/hides the geography div if poverty asset is missing/has geometries.
 * @param {EeFC} povertyAssetName
 * @return {void} Completes instantly, since all promises already done
 */
async function showGeographyDivBasedOnPoverty(povertyAssetName) {
  setGeographyDivVisibility(!await povertyHasGeometry(povertyAssetName));
}

/**
 * Sets geography div to be visible/hidden.
 * @param {boolean} visible
 */
function setGeographyDivVisibility(visible) {
  if (visible) {
    componentsData.geography.div.show();
    componentsData.geography.columnsPending.markVisible();
  } else {
    componentsData.geography.div.hide();
    componentsData.geography.columnsPending.markInvisible();
  }
}

/**
 * Returns true if poverty asset has geometry, or, if it is not set, uses the
 * geography asset's path being set as a guide to whether poverty will have
 * geometry.
 * @param {EeFC} povertyAssetName
 * @return {boolean} Completes instantly, since all promises already done
 */
async function povertyHasGeometry(povertyAssetName) {
  if (!povertyAssetName) {
    // Use geography asset's presence as hint for whether to show div.
    return !getPageValueOfPath(componentsData.geography.path);
  }
  // Should complete instantly since already finished this call earlier.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  return disasterAssets.get(povertyAssetName).hasGeometry;
}

/**
 * @param {EeFC} assetName
 * @return {boolean} If buildings asset has geometry or unset. Done instantly
 */
async function buildingsHasGeometry(assetName) {
  if (!assetName) {
    // No asset yet: assume when they do choose an asset it'll have geometries.
    return true;
  }
  // Should complete instantly.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  return disasterAssets.get(assetName).hasGeometry;
}

/** @param {Array<EeColumn>} columns Poverty building-count select options */
function setOptionsForPovertyBuildings(columns) {
  setOptionsForSelect(columns, POVERTY_BUILDINGS_PATH);
}

/**
 * Initializes `assetKey` div: create pending asset select and column selects.
 * @param {ScoreInputType} assetKey
 * @return {JQuery<HTMLSelectElement>} Asset select
 */
function createSelectAndColumns(assetKey) {
  const {div, path, columns} = componentsData[assetKey];
  const select = createSelect(path);
  div.empty()
      .append($(document.createElement('span'))
                  .text(capitalizeFirstLetter(assetKey) + ' asset path: '))
      .append(select);
  // Create columns list.
  const attrList = createListForAsset(assetKey);
  for (const columnInfo of columns) {
    attrList.append(createSelectListItemFromColumnInfo(columnInfo));
  }
  div.append(attrList);
  return select;
}

/**
 * Sets options for `key`'s column selects, finishes `key`'s pending operation.
 * @param {Array<EeColumn>} properties Column select options
 * @param {ScoreInputType} key
 */
function setOptionsForColumns(properties, key) {
  for (const columnInfo of componentsData[key].columns) {
    setOptionsForSelect(properties, columnInfo.path);
  }
  componentsData[key].columnsPending.finishPending();
}

/**
 * Sets all `key` columns to "pending", starts `key`'s pending operation.
 * @param {ScoreInputType} key
 */
function setPendingForColumns(key) {
  if (componentsData[key].columnsPending.maybeStartPending()) {
    for (const columnInfo of componentsData[key].columns) {
      showSelectAsPending(columnInfo.path);
    }
  }
}

/**
 * Sets `key`'s div's visibility, and reinstates/removes its pending operation:
 * invisible divs should not count as pending, even if waiting on data there,
 * and visible divs should count as pending, even if previously hidden.
 * @param {ScoreInputType} key
 * @param {boolean} visible
 */
function setVisibilityOfDivForKey(key, visible) {
  if (visible) {
    componentsData[key].div.show();
    componentsData[key].columnsPending.markVisible();
  } else {
    componentsData[key].div.hide();
    componentsData[key].columnsPending.markInvisible();
  }
}

//   Building-source radio-button-related functions, and startup function.

/**
 * Initializes flexible elements that can be interacted with before Firestore
 * finishes: the radio buttons determining the source of damage, and stores
 * divs for each {@link ScoreInputType}.
 */
function setUpFlexibleOnPageLoad() {
  // Set up radio buttons for flexible buildings source.
  $('#buildings-source-buildings').on('click', () => {
    handleAssetDataChange(BuildingSource.BUILDING, BUILDING_SOURCE_PATH);
    onBuildingSourceBuildingsSelected();
    validateFlexibleUserFields();
  });
  $('#buildings-source-poverty').on('click', () => {
    handleAssetDataChange(BuildingSource.POVERTY, BUILDING_SOURCE_PATH);
    onBuildingSourcePovertySelected();
    validateFlexibleUserFields();
  });
  $('#' +
    'buildings-source-damage')
      .on('click', () => {
        handleAssetDataChange(BuildingSource.DAMAGE, BUILDING_SOURCE_PATH);
        onBuildingSourceDamageSelected();
        validateFlexibleUserFields();
      });
  componentsData.poverty.div = $('#flexible-poverty-asset-data');
  componentsData.geography.div = $('#flexible-geography-asset-data');
  componentsData.buildings.div = $('#buildings-source-buildings-div');
  povertyBuildingsDiv = $('#buildings-source-poverty-div');
}

/**
 * Handles "buildings" choice: shows/hides div, sets damage columns' explanation
 * texts to defaults, and computes whether to show damage value item.
 */
function onBuildingSourceBuildingsSelected() {
  setVisibilityOfDivForKey('buildings', true);
  povertyBuildingsDiv.hide();
  setExplanationSpanTextForColumn(NODAMAGE_COLUMN_INFO);
  setExplanationSpanTextForColumn(NODAMAGE_VALUE_INFO);
  maybeShowNoDamageValueItem();
}

/** Similar to {@link onBuildingSourceBuildingsSelected}. */
function onBuildingSourcePovertySelected() {
  setVisibilityOfDivForKey('buildings', false);
  povertyBuildingsDiv.show();
  setExplanationSpanTextForColumn(NODAMAGE_COLUMN_INFO);
  setExplanationSpanTextForColumn(NODAMAGE_VALUE_INFO);
  maybeShowNoDamageValueItem();
}

/**
 * Similar to {@link onBuildingSourceBuildingsSelected}, but sets text for
 * damage columns to indicate they are mandatory if damage asset is present.
 */
function onBuildingSourceDamageSelected() {
  setVisibilityOfDivForKey('buildings', false);
  povertyBuildingsDiv.hide();
  setExplanationSpanTextForColumn(
      NODAMAGE_COLUMN_INFO,
      'must be specified since damage contains all buildings');
  setExplanationSpanTextForColumn(
      NODAMAGE_VALUE_INFO,
      'must be specified since damage contains all buildings');
  maybeShowNoDamageValueItem();
}

/**
 * @return {boolean} If damage asset is used for buildings. Uses stored data,
 *     not page data, since they are always in sync for a radio button
 */
function useDamageForBuildings() {
  return isFlexible() &&
      getStoredValueFromPath(BUILDING_SOURCE_PATH) === BuildingSource.DAMAGE;
}
