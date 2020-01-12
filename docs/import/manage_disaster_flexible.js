import {showError} from '../error.js';
import {getDisaster} from '../resources.js';

import {BuildingSource} from './create_disaster_lib.js';
import {getDisasterAssetsFromEe} from './list_ee_assets.js';
import {capitalizeFirstLetter, checkDamageFieldsAndShowProcessButton, continueMessage, createListForAsset, createSelect, createSelectListItemFromColumnInfo, createSelectWithSimpleWriteOnChange, damageAssetPresent, getAssetsAndSetOptionsForSelect, getPageValueOfPath, getStoredValueFromPath, handleAssetDataChange, isFlexible, NODAMAGE_COLUMN_INFO, NODAMAGE_VALUE_INFO, setExplanationSpanTextForColumn, setOptionsForSelect, showDisabledProcessButton, showListForAsset, showSelectAsPending, validateColumnPathHasValue, verifyAsset, writeSelectAndGetPropertyNames,} from './manage_disaster_base.js';

export {
  finishPending,
  initializeFlexible,
  onSetFlexibleDisaster,
  startPending,
  useDamageForBuildings,
  validateFlexibleUserFields,
};

/**
 * Flexible disaster assets have the complication of "triggering" other data's
 * presence or absence: a poverty asset with geometries does not require a
 * geography asset, so we hide it. If the building asset has no geometries, it
 * must have two fields specified, giving the geoid and building counts. Thus,
 * the three types of assets here each need to take some action upon an asset
 * change. Principally, this involves showing the required columns for the
 * asset.
 *
 * Because showing the columns can take time (since the columns have to be
 * retrieved from EarthEngine), we cannot do validation as soon as a value
 * changes. Instead, we have to wait for all pending operations to complete. In
 * order to do that, we track the number of pending operations, and only
 * validate when it is 0.
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

const DISTRICT_ID_LABEL = 'district identifier column';
const DISTRICT_ID_EXPLANATION = 'to match with poverty asset\'s';
const BUILDING_KEY_PATH = ['flexibleData', 'buildingKey'];
const BUILDING_GEOID_PATH = ['flexibleData', 'buildingGeoid'];

const povertyPath = ['flexibleData', 'povertyPath'];

const geographyPath = ['flexibleData', 'geographyPath'];

const BUILDING_PATH = Object.freeze(['flexibleData', 'buildingPath']);

/**
 * @type {Object}
 * @property {ColumnInfo} poverty
 * @property {ColumnInfo} geography
 * @property {ColumnInfo} buildings
 */
const COMPONENTS_DATA = {
  poverty: {
    path: povertyPath,
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
    ]
  },
  geography: {
    path: geographyPath,
    div: null,
    columns: [{
      label: DISTRICT_ID_LABEL,
      explanation: DISTRICT_ID_EXPLANATION,
      path: ['flexibleData', 'geographyGeoid']
    }]
  },
  buildings: {
    path: BUILDING_PATH,
    div: null,
    columns: [
      {
        label: DISTRICT_ID_LABEL,
        explanation: DISTRICT_ID_EXPLANATION,
        path: BUILDING_GEOID_PATH
      },
      {
        label: 'building counts column',
        path: BUILDING_KEY_PATH,
      }
    ]
  }
};

const MISSING_BUILDINGS_TAIL =
    ' (choose damage asset as buildings source for now if you don\'t need buildings)';

let pendingOperations = 0;

function startPending() {
  if (!isFlexible()) {
    return;
  }
  if (pendingOperations++ === 0) {
    validateFlexibleUserFields();
  }
}

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

function validateFlexibleUserFields() {
  if (pendingOperations > 0) {
    showDisabledProcessButton('Pending...');
    return;
  }
  let message = '';
  let optionalMessage = '';
  const povertyAssetName = getPageValueOfPath(povertyPath);
  if (povertyAssetName) {
    message = checkColumns(message, 'poverty');
    if (!getStoredValueFromPath(POVERTY_HAS_GEOMETRY_PATH)) {
      const geographyAssetName = getPageValueOfPath(geographyPath);
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
        const buildingAssetName = getPageValueOfPath(BUILDING_PATH);
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
  checkDamageFieldsAndShowProcessButton(message, optionalMessage);
}

function checkColumns(message, key) {
  return addColumnArrayErrorsToMessage(
      message, COMPONENTS_DATA[key].columns, key);
}

function addColumnArrayErrorsToMessage(message, columnInfos, key) {
  const missingLabels = validateColumnArray(columnInfos);
  if (missingLabels) {
    return continueMessage(
        message,
        'must specify properties from ' + key + ' asset: ' + missingLabels);
  }
  return message;
}

const BUILDING_SOURCE_PATH = Object.freeze(['flexibleData', 'buildingSource']);

/////////////////////////////////////////////////////////
// Initialization functions: called once per disaster. //
/////////////////////////////////////////////////////////

/**
 * Initializes div for buildings asset. Creates building select, adds change
 * handler, and sets up initial page layout based on Firestore data.
 * @returns {Promise<?Array<string>>} Promise that completes when
 */
async function initializeBuildingSourceBuildings() {
  const buildingSelect =
      createSelectAndColumns('buildings')
          .on('change', () => onBuildingChange(buildingSelect.val()));
  if (getStoredValueFromPath(BUILDING_HAS_GEOMETRY_PATH)) {
    // Hide columns list if we actually expect them not to be shown in the end
    // because the building asset has geometries.
    showListForAsset(false, 'buildings');
  }
  if (!await getAssetsAndSetOptionsForSelect(BUILDING_PATH)) {
    return null;
  }
  if (await shouldDisplayBuildingProperties(buildingSelect.val())) {
    return showRealColumns('buildings');
  } else {
    showListForAsset(false, 'buildings');
  }
}

async function onSetFlexibleDisaster(assetData) {
  startPending();
  $('#state-based-disaster-asset-selection-table').hide();
  $('#flexible-data').show();
  const {buildingSource} = assetData.flexibleData;
  if (buildingSource !== null) {
    switch (buildingSource) {
      case BuildingSource.BUILDING:
        showDivsForBuildingSourceBuildings();
        $('#buildings-source-buildings').prop('checked', true);
        break;
      case BuildingSource.POVERTY:
        showDivsForBuildingSourcePoverty();
        $('#buildings-source-poverty').prop('checked', true);
        break;
      case BuildingSource.DAMAGE:
        showDivsForBuildingSourceDamage();
        $('#buildings-source-damage').prop('checked', true);
        break;
    }
  }
  setGeographyDivVisibility(!getStoredValueFromPath(POVERTY_HAS_GEOMETRY_PATH));
  return Promise
      .all([
        initializeGeography(), initializeBuildingSourceBuildings(),
        initializePoverty()
      ])
      .then(finishPending);
}

async function initializePoverty() {
  const select = createSelectAndColumns('poverty').on(
      'change', () => onPovertyChange(select.val()));
  $('#buildings-poverty-select-span')
      .append(createSelectWithSimpleWriteOnChange(POVERTY_BUILDINGS_PATH));
  if (!await getAssetsAndSetOptionsForSelect(COMPONENTS_DATA.poverty.path)) {
    return;
  }
  await doGeographyForPoverty(select.val());
  const propertyNames = await showRealColumns('poverty');
  if (propertyNames) {
    setOptionsForPovertyBuildings(propertyNames);
  }
}

async function onPovertyChange(val) {
  handleAssetDataChange(
      await povertyHasGeometry(val), POVERTY_HAS_GEOMETRY_PATH);
  await doGeographyForPoverty(val);
  const propertyNames = await onSelectChange('poverty');
  if (!propertyNames) {
    return null;
  }
  setOptionsForColumns(propertyNames, 'poverty');
  setOptionsForPovertyBuildings(propertyNames);
  finishPending();
}

const POVERTY_HAS_GEOMETRY_PATH = ['flexibleData', 'povertyHasGeometry'];

async function doGeographyForPoverty(povertyAssetName) {
  setGeographyDivVisibility(!await povertyHasGeometry(povertyAssetName));
}

function getGeographyDiv() {
  return $('#flexible-geography-asset-data');
}

function setGeographyDivVisibility(visible) {
  const geographyDiv = getGeographyDiv();
  if (visible) {
    geographyDiv.show();
  } else {
    geographyDiv.hide();
  }
}

async function povertyHasGeometry(povertyAssetName) {
  if (!povertyAssetName) {
    // Use geography asset's presence as hint for whether to show div.
    return !getPageValueOfPath(geographyPath);
  }
  // Should complete instantly since already finished this call earlier.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  return disasterAssets.get(povertyAssetName).hasGeometry;
}

async function initializeGeography() {
  createSelectAndColumns('geography').on('change', onGeographyChange);
  if (await getAssetsAndSetOptionsForSelect(geographyPath, false)) {
    return showRealColumns('geography');
  }
}

async function onGeographyChange() {
  const propertyNames = await onSelectChange('geography');
  if (propertyNames) {
    setOptionsForColumns(propertyNames, 'geography');
  }
  finishPending();
}

async function onBuildingChange(val) {
  const propertyNamesPromise = onSelectChange('buildings');
  const noGeometry = await shouldDisplayBuildingProperties(val);
  handleAssetDataChange(!noGeometry, BUILDING_HAS_GEOMETRY_PATH);
  showListForAsset(!noGeometry, 'buildings');
  if (noGeometry) {
    setOptionsForColumns(null, 'buildings');
    const propertyNames = await propertyNamesPromise;
    if (propertyNames) {
      setOptionsForColumns(propertyNames, 'buildings');
    }
  }
  finishPending();
}

async function shouldDisplayBuildingProperties(assetName) {
  if (!assetName) {
    return false;
  }
  // Should complete instantly.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  // Buildings have geometry, so we are intersecting them. No properties if so.
  return !disasterAssets.get(assetName).hasGeometry;
}

function onSelectChange(key) {
  setOptionsForColumns(null, key);
  return writeSelectAndGetPropertyNames(COMPONENTS_DATA[key].path);
}

function validateColumnArray(array) {
  return array.map(validateColumnPathHasValue).filter((c) => c).join(', ');
}

const BUILDING_HAS_GEOMETRY_PATH = ['flexibleData', 'buildingHasGeometry'];

const POVERTY_BUILDINGS_PATH = ['flexibleData', 'povertyBuildingKey'];

function setOptionsForPovertyBuildings(properties) {
  setOptionsForSelect(properties, POVERTY_BUILDINGS_PATH);
}

async function showRealColumns(key) {
  setOptionsForColumns(null, key);
  const propertyNames = await verifyAsset(COMPONENTS_DATA[key].path, []);
  if (propertyNames) {
    setOptionsForColumns(propertyNames, key);
  }
  return propertyNames;
}

function createSelectAndColumns(assetKey) {
  const div = COMPONENTS_DATA[assetKey].div;
  const select = createSelect(COMPONENTS_DATA[assetKey].path);
  div.append($(document.createElement('span'))
                 .text(capitalizeFirstLetter(assetKey) + ' asset path: '))
      .append(select);
  createColumns(assetKey);
  return select;
}

function createColumns(key) {
  const attrList = createListForAsset(key);
  for (const columnInfo of COMPONENTS_DATA[key].columns) {
    attrList.append(createSelectListItemFromColumnInfo(columnInfo));
  }
  COMPONENTS_DATA[key].div.append(attrList);
}

function setOptionsForColumns(properties, key) {
  for (const columnInfo of COMPONENTS_DATA[key].columns) {
    if (properties) {
      setOptionsForSelect(properties, columnInfo.path);
    } else {
      showSelectAsPending(columnInfo.path);
    }
  }
}

//       Building-source radio-button-related methods.

/**
 * Initializes flexible elements that can be interacted with before Firestore
 * finishes: the radio buttons determining the source of damage.
 */
function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  $('#buildings-source-buildings').on('click', () => {
    handleAssetDataChange(BuildingSource.BUILDING, BUILDING_SOURCE_PATH);
    showDivsForBuildingSourceBuildings();
    validateFlexibleUserFields();
  });
  $('#buildings-source-poverty').on('click', () => {
    handleAssetDataChange(BuildingSource.POVERTY, BUILDING_SOURCE_PATH);
    showDivsForBuildingSourcePoverty();
    validateFlexibleUserFields();
  });
  $('#' +
    'buildings-source-damage')
      .on('click', () => {
        handleAssetDataChange(BuildingSource.DAMAGE, BUILDING_SOURCE_PATH);
        showDivsForBuildingSourceDamage();
        validateFlexibleUserFields();
      });
  COMPONENTS_DATA.poverty.div = $('#flexible-poverty-asset-data');
  COMPONENTS_DATA.geography.div = getGeographyDiv();
  COMPONENTS_DATA.buildings.div = $('#buildings-source-buildings-div');
}

function showDivsForBuildingSourceBuildings() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.show();
  divs.povertyDiv.hide();
  setExplanationSpanTextForColumn(NODAMAGE_COLUMN_INFO);
  setExplanationSpanTextForColumn(NODAMAGE_VALUE_INFO);
}

function showDivsForBuildingSourceDamage() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.hide();
  setExplanationSpanTextForColumn(
      NODAMAGE_COLUMN_INFO,
      'must be specified since damage contains all buildings');
  setExplanationSpanTextForColumn(
      NODAMAGE_VALUE_INFO,
      'must be specified since damage contains all buildings');
}

function showDivsForBuildingSourcePoverty() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.show();
  setExplanationSpanTextForColumn(NODAMAGE_COLUMN_INFO);
  setExplanationSpanTextForColumn(NODAMAGE_VALUE_INFO);
}

function getBuildingsDivs() {
  return {
    buildingsDiv: $('#buildings-source-buildings-div'),
    povertyDiv: $('#buildings-source-poverty-div')
  };
}

function useDamageForBuildings() {
  return getStoredValueFromPath(BUILDING_SOURCE_PATH) === BuildingSource.DAMAGE;
}