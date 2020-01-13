import {showError} from '../error.js';
import {getDisaster} from '../resources.js';

import {BuildingSource} from './create_disaster_lib.js';
import {getDisasterAssetsFromEe} from './list_ee_assets.js';
import {capitalizeFirstLetter, checkDamageFieldsAndShowKickoffButton, continueMessage, createListForAsset, createSelect, createSelectListItemFromColumnInfo, createSelectWithSimpleWriteOnChange, damageAssetPresent, getAssetsAndSetOptionsForSelect, getPageValueOfPath, getStoredValueFromPath, handleAssetDataChange, isFlexible, maybeShowNoDamageValueItem, NODAMAGE_COLUMN_INFO, NODAMAGE_VALUE_INFO, setExplanationSpanTextForColumn, setOptionsForSelect, showDisabledKickoffButton, showListForAsset, showSelectAsPending, startPendingWriteSelectAndGetPropertyNames, validateColumnPathHasValue, verifyAsset} from './manage_disaster_base.js';

export {
  finishPending,
  initializeFlexibleDisaster,
  setUpFlexibleOnPageLoad,
  startPending,
  useDamageForBuildings,
  validateFlexibleUserFields,
};

/**
 * Functions for dealing with a "flexible" (non-state-based) disaster.
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
 * ## Validation
 *
 * Because of the delay in the second case, we can't validate user inputs
 * immediately when the value changes. Instead, we have to wait for all pending
 * operations to complete. That way, for instance, if the user has specified
 * that column A is the "poverty rate column", but then changes poverty assets
 * to asset2, which has no column named 'A', we will correctly say that the
 * poverty rate column needs to be set: in Firestore, 'A' is still the value
 * for
 * the poverty rate column, but on the page, it won't be set because A is not
 * present in asset2's columns, which will be what is shown in the select. See
 * below, "Validation-related functions", for how to track pending operations.
 *
 * ## Building counts
 * Another complication is the four ways that the building count can be
 * specified: coming from a buildings asset that has building footprints (like
 * the Microsoft data); coming from an asset that has counts per district (like
 * US Census buildings data; coming from the poverty asset itself (might be
 * approximated by total households); or coming from the damage asset (like
 * the asset CrowdAI provides, with both damaged and undamaged buildings).

 * ## Page display
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
 * is not specified, the select will have just the value 'None'.
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
 * A number of functions are declared async because they wait on the disaster
 * assets listing. However, once the assets are initially loaded, the listing
 * will always be instantly available (since it is cached), so those functions
 * can be called with no fear of actually waiting. They are indicated by their
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
const BUILDING_HAS_GEOMETRY_PATH = ['flexibleData', 'buildingHasGeometry'];
const POVERTY_BUILDINGS_PATH = ['flexibleData', 'povertyBuildingKey'];

const DISTRICT_ID_LABEL = 'district identifier column';
const DISTRICT_ID_EXPLANATION = 'to match with poverty asset\'s';

/**
 * Either 'poverty', 'geography', or 'buildings'.
 * @typedef {string} ScoreInputType
 */

/**
 * @typedef {Object} ScoreInputData
 * @property {PropertyPath} path Path to the actual asset value.
 * @property {JQuery<HTMLDivElement>} Div where this score input is displayed.
 *     Set in {@link setUpFlexibleOnPageLoad}.
 * @property {Array<ColumnInfo>} Columns associated with this score input.
 */

/**
 * @type {Object}
 * @property {ScoreInputData} poverty
 * @property {ScoreInputData} geography
 * @property {ScoreInputData} buildings
 */
const COMPONENTS_DATA = {
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
        label: 'district identifier column',
        explanation: 'typically a number or short string',
        path: ['flexibleData', 'povertyGeoid'],
      },
    ],
  },
  geography: {
    path: ['flexibleData', 'geographyPath'],
    div: null,
    columns: [{
      label: DISTRICT_ID_LABEL,
      explanation: DISTRICT_ID_EXPLANATION,
      path: ['flexibleData', 'geographyGeoid'],
    }],
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
  },
};

const MISSING_BUILDINGS_TAIL =
    ' (choose damage asset as buildings source for now if you don\'t need ' +
    'buildings)';

//                   Validation-related functions.

/**
 * As described above, we cannot do validation until all pending operations are
 * complete.
 * We track pending operations by calling {@link startPending} before doing
 * asynchronous operations. We then call {@link finishPending} when we have
 * displayed all data resulting from that asynchronous operation. Note that
 * calling {@link finishPending} right after the asynchronous operation is done
 * would not work: we would attempt to validate user fields that have not yet
 * been set, because the data from the asynchronous operation has not yet been
 * displayed. {@link startPending} is most often called in
 * {@link startPendingWriteSelectAndGetPropertyNames}, which is invoked by each
 * change handler. {@link finishPending} must be called by each change handler.
 * For safety, we always call {@link finishPending} in a `finally` block.
 */

let pendingOperations = 0;

/**
 * Notes that a pending operation has started. If no operations were previously
 * pending, calls {@link validateFlexibleUserFields} in order to show the user
 * the new pending status. Called unconditionally by manage_disaster_base.js,
 * even if disaster is not flexible, does nothing in that case.
 */
function startPending() {
  if (!isFlexible()) {
    return;
  }
  if (pendingOperations++ === 0) {
    validateFlexibleUserFields();
  }
}

/**
 * Notes that a pending operation has finished. If all pending operations are
 * done, calls {@link validateFlexibleUserFields} in order to show the user
 * the new definitive status. Called unconditionally by manage_disaster_base.js,
 * even if disaster is not flexible, does nothing in that case.
 */
function finishPending() {
  if (!isFlexible()) {
    return;
  }
  if (--pendingOperations === 0) {
    validateFlexibleUserFields();
  }
  if (pendingOperations < 0) {
    // Belt and suspenders, and helpful when debugging.
    showError('Problem validating inputs. Please reload page');
  }
}

/**
 * Validates user fields, and shows result on kick-off button. If there are
 * still operations pending, just shows a 'Pending...' message and does no
 * validation.
 */
function validateFlexibleUserFields() {
  if (pendingOperations > 0) {
    showDisabledKickoffButton('Pending...');
    return;
  }
  let message = '';
  let optionalMessage = '';
  const povertyAssetName = getPageValueOfPath(COMPONENTS_DATA.poverty.path);
  if (povertyAssetName) {
    message = checkColumns(message, 'poverty');
    if (!getStoredValueFromPath(POVERTY_HAS_GEOMETRY_PATH)) {
      const geographyAssetName =
          getPageValueOfPath(COMPONENTS_DATA.geography.path);
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
            getPageValueOfPath(COMPONENTS_DATA.buildings.path);
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
        if (hasDamageAsset) {
          message = addColumnArrayErrorsToMessage(
              message, [NODAMAGE_COLUMN_INFO, NODAMAGE_VALUE_INFO], 'damage');
        } else {
          optionalMessage = 'building counts';
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
      message, COMPONENTS_DATA[key].columns, key);
}

/**
 * Checks columns in `columnInfos` to make sure they all have values. If not,
 * appends errors to `message`.
 * @param {string} message Current error message
 * @param {Array<ColumnInfo>} columnInfos
 * @param {string|ScoreInputType} scoreInputType String to display in error
 *     message
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
      .filter((c) => c)
      .join(', ');
}

//         Initialization functions: called once per disaster.

/**
 * Initializes page: sets up change handlers for building-source radios and
 * initializes the three {@link ScoreInputType} divs. Calls {@link startPending}
 * before any work is done, and calls {@link finishPending} after all work
 * completed, so that all other initialization work can skip calling those
 * functions, since we are guaranteed to be pending until everything is done.d
 * @param {AssetData} assetData
 * @return {Promise<*>} Promise that completes when all work is done.
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
  startPending();
  try {
    return await Promise.all([
      initializeGeography(),
      initializePoverty(),
      initializeBuildings(),
    ]);
  } finally {
    finishPending();
  }
}

/**
 * Initializes geography div setup. Creates the necessary select element and
 * list of columns; waits for the list of assets to populate the select; then
 * waits for the list of columns to populate each column select. This is the
 * simplest initializer, because geography has no special cascading effects. The
 * other initializers {@link initializePoverty} and {@link initializeBuildings}
 * do this as well, but have additional tasks.
 * @return {Promise<*>} Promise that completes when display is complete
 */
async function initializeGeography() {
  createSelectAndColumns('geography').on('change', onGeographyChange);
  if (await getAssetsAndSetOptionsForSelect(
          COMPONENTS_DATA.geography.path, false)) {
    return setInitialColumnValues('geography');
  }
}

/**
 * Initializes poverty-related display. In addition to doing the analog of what
 * {@link initializeGeography} does, there are two complications: geography div
 * visibility is based on poverty asset having geometries, and we must
 * initialize a column select (for the building-count column) in a different
 * div from the standard poverty div.
 * @return {Promise<void>} Promise that completes when all display completed
 */
async function initializePoverty() {
  const select = createSelectAndColumns('poverty').on(
      'change', () => onPovertyChange(select.val()));
  // Take a guess at what geography visibility will be.
  setGeographyDivVisibility(!getStoredValueFromPath(POVERTY_HAS_GEOMETRY_PATH));
  // Create special column select for building-count column.
  $('#buildings-poverty-select-span')
      .empty()
      .append(createSelectWithSimpleWriteOnChange(POVERTY_BUILDINGS_PATH));
  if (!await getAssetsAndSetOptionsForSelect(COMPONENTS_DATA.poverty.path)) {
    // Disaster changed: abort.
    return;
  }
  // Set actual geography visibility.
  await showGeographyDivBasedOnPoverty(select.val());
  const propertyNames = await setInitialColumnValues('poverty');
  if (propertyNames) {
    // Do special column setup, if disaster unchanged.
    setOptionsForPovertyBuildings(propertyNames);
  }
}

/**
 * Initializes display related to buildings asset, for the case that the user is
 * specifying a buildings asset to compute building counts. In addition to doing
 * the analog of what {@link initializeGeography} does, there is the
 * complication that we do not show the list of column selects when the asset
 * has geometries, since then we interpret the asset as a collection of building
 * locations.
 * @return {Promise<void>} Promise that completes when all displayed
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
  if (!await getAssetsAndSetOptionsForSelect(COMPONENTS_DATA.buildings.path)) {
    return null;
  }
  if (await buildingsHasGeometry(buildingSelect.val())) {
    showListForAsset(false, 'buildings');
  } else {
    return setInitialColumnValues('buildings');
  }
}

/**
 * Called by initializers. Shows pending status for column selects, then gets
 * column names for selected asset from EarthEngine, sets column select values
 * to those values (if disaster unchanged), and returns list of column names.
 * @param {ScoreInputType} key
 * @return {Promise<?Array<EeColumn>>} Null if disaster changed
 */
async function setInitialColumnValues(key) {
  setPendingForColumns(key);
  const propertyNames = await verifyAsset(COMPONENTS_DATA[key].path, []);
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
  try {
    const propertyNames = await onAssetSelectChange('geography');
    if (propertyNames) {
      setOptionsForColumns(propertyNames, 'geography');
    }
  } finally {
    finishPending();
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
  handleAssetDataChange(
      await povertyHasGeometry(povertyAsset), POVERTY_HAS_GEOMETRY_PATH);
  await showGeographyDivBasedOnPoverty(povertyAsset);
  try {
    const propertyNames = await onAssetSelectChange('poverty');
    if (propertyNames) {
      setOptionsForColumns(propertyNames, 'poverty');
      setOptionsForPovertyBuildings(propertyNames);
    }
  } finally {
    finishPending();
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
  const propertyNamesPromise = onAssetSelectChange('buildings');
  try {
    const hasGeometry = await buildingsHasGeometry(buildingsAsset);
    handleAssetDataChange(hasGeometry, BUILDING_HAS_GEOMETRY_PATH);
    showListForAsset(!hasGeometry, 'buildings');
    if (!hasGeometry) {
      setPendingForColumns('buildings');
      const propertyNames = await propertyNamesPromise;
      if (propertyNames) {
        setOptionsForColumns(propertyNames, 'buildings');
      }
    }
  } finally {
    finishPending();
  }
}

/**
 * Handles basic operation of an asset selection change: sets relevant columns
 * to 'pending', writes to Firestore, and returns columns of newly chosen asset.
 * Calls {@link startPending} via
 * {@link startPendingWriteSelectAndGetPropertyNames}, so callers must call
 * {@link finishPending}!
 * @param {ScoreInputType} key
 * @return {Promise<?Array<EeColumn>>} Null if selection no longer current
 */
function onAssetSelectChange(key) {
  setPendingForColumns(key);
  return startPendingWriteSelectAndGetPropertyNames(COMPONENTS_DATA[key].path);
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
    COMPONENTS_DATA.geography.div.show();
  } else {
    COMPONENTS_DATA.geography.div.hide();
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
    return !getPageValueOfPath(COMPONENTS_DATA.geography.path);
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
    // Assume geometry when they finally choose a buildings asset.
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
  const scoreInputData = COMPONENTS_DATA[assetKey];
  const div = scoreInputData.div;
  const select = createSelect(scoreInputData.path);
  div.append($(document.createElement('span'))
                 .text(capitalizeFirstLetter(assetKey) + ' asset path: '))
      .append(select);
  // Create columns list.
  const attrList = createListForAsset(assetKey);
  for (const columnInfo of scoreInputData.columns) {
    attrList.append(createSelectListItemFromColumnInfo(columnInfo));
  }
  div.append(attrList);
  return select;
}

/**
 * @param {Array<EeColumn>} properties Column select options
 * @param {ScoreInputType} key
 */
function setOptionsForColumns(properties, key) {
  for (const columnInfo of COMPONENTS_DATA[key].columns) {
    setOptionsForSelect(properties, columnInfo.path);
  }
}

/** @param {ScoreInputType} key All `key` columns will be set to "pending" */
function setPendingForColumns(key) {
  for (const columnInfo of COMPONENTS_DATA[key].columns) {
    showSelectAsPending(columnInfo.path);
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
  COMPONENTS_DATA.poverty.div = $('#flexible-poverty-asset-data');
  COMPONENTS_DATA.geography.div = $('#flexible-geography-asset-data');
  COMPONENTS_DATA.buildings.div = $('#buildings-source-buildings-div');
}

/**
 * Handles "buildings" choice: shows/hides div, sets damage columns' explanation
 * texts to defaults, and computes whether to show damage value item
 */
function onBuildingSourceBuildingsSelected() {
  COMPONENTS_DATA.buildings.div.show();
  COMPONENTS_DATA.poverty.div.hide();
  setExplanationSpanTextForColumn(NODAMAGE_COLUMN_INFO);
  setExplanationSpanTextForColumn(NODAMAGE_VALUE_INFO);
  maybeShowNoDamageValueItem();
}

/** Similar to {@link onBuildingSourceBuildingsSelected}. */
function onBuildingSourcePovertySelected() {
  COMPONENTS_DATA.buildings.div.hide();
  COMPONENTS_DATA.poverty.div.show();
  setExplanationSpanTextForColumn(NODAMAGE_COLUMN_INFO);
  setExplanationSpanTextForColumn(NODAMAGE_VALUE_INFO);
  maybeShowNoDamageValueItem();
}

/**
 * Similar to {@link onBuildingSourceBuildingsSelected}, but sets text for
 * damage columns to indicate they are mandatory if damage is selected.
 */
function onBuildingSourceDamageSelected() {
  COMPONENTS_DATA.buildings.div.hide();
  COMPONENTS_DATA.poverty.div.hide();
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
