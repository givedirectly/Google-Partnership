import {getDisaster} from '../resources.js';
import {BuildingSource} from './create_disaster_lib.js';

import {
  createPendingSelect,
  getDisasterAssetsFromEe
} from './list_ee_assets.js';
import {
  capitalizeFirstLetter,
  continueMessage,
  createAssetDropdownWithNone,
  createColumnDropdown,
  createEnabledProperties,
  createSelectListItemFromColumnInfo,
  DAMAGE_COLUMN_INFO,
  DAMAGE_VALUE_INFO,
  damageAssetPresent,
  getElementFromPath,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData,
  makeIdFromPath,
  removeAndCreateUl,
  validateColumnArray,
  writeSelectAndGetPropertyNames,
  verifyAsset,
  checkDamageFieldsAndShowProcessButton,
  showProcessButton,
  removePendingOperation,
  addPendingOperation,
  allOperationsFinished,
  getPageValueOfPath, prepareContainerDiv,
} from './manage_disaster_base.js';

export {initializeFlexible, onSetFlexibleDisaster, validateFlexibleUserFields};

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

/**
 * @type {Object}
 * @property {ColumnInfo} poverty
 * @property {ColumnInfo} geography
 * @property {ColumnInfo} buildings
 */
const COLUMNS =
    {
      poverty: [
        {
          label: 'poverty rate column',
          path: ['flexibleData', 'povertyRateKey']
        },
        {
          label: 'district description column',
          explanation: 'human-readable description of each region',
          path: ['flexibleData', 'districtDescriptionKey']
        },
        {
          label: 'district identifier column',
          explanation: 'typically a number or short string',
          path: ['flexibleData', 'povertyGeoid'],
        },],
      geography: [
        {
          label: DISTRICT_ID_LABEL,
          explanation: DISTRICT_ID_EXPLANATION,
          path: ['flexibleData', 'geographyGeoid']
        }
      ],
      buildings: [
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
    };

const MISSING_BUILDINGS_TAIL = ' (choose damage asset as buildings source for now if you don\'t need buildings)';

function startPending() {
  addPendingOperation();
  validateFlexibleUserFields();
}

function finishPending() {
  removePendingOperation();
  validateFlexibleUserFields();
}

function validateFlexibleUserFields() {
  if (!allOperationsFinished()) {
    showProcessButton('Pending...');
    return;
  }
  let message = '';
  let optionalMessage = '';
  const povertyAssetName = getPageValueOfPath(povertyPath);
  if (povertyAssetName) {
    message = checkColumns(message, 'poverty');
    if (!getElementFromPath(POVERTY_HAS_GEOMETRY_PATH)) {
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
  const buildingSource = getElementFromPath(BUILDING_SOURCE_PATH);
  const hasDamageAsset = damageAssetPresent();
  if (buildingSource === null) {
    if (hasDamageAsset) {
      message = continueMessage(message, 'missing choice for building count source');
    } else {
      optionalMessage = 'building counts';
    }
  } else {
    let tailAboutBuildingsWorkaround = false;
    switch (buildingSource) {
      case BuildingSource.BUILDING:
        const buildingAssetName = getPageValueOfPath(BUILDING_PATH);
        if (buildingAssetName) {
          if (!getElementFromPath(BUILDING_HAS_GEOMETRY_PATH)) {
            message = checkColumns(message, 'buildings');
          }
        } else {
          message = continueMessage(message, 'missing buildings asset');
          tailAboutBuildingsWorkaround = !hasDamageAsset;
        }
        break;
      case BuildingSource.POVERTY:
        if (!$('#' + makeIdFromPath(BUILDING_KEY_PATH)).val()) {
          message = continueMessage(message,
              'must specify building-count column');
          tailAboutBuildingsWorkaround = !hasDamageAsset;
        }
        break;
      case BuildingSource.DAMAGE:
        if (hasDamageAsset) {
          message = addColumnArrayErrorsToMessage(message,
              [DAMAGE_COLUMN_INFO, DAMAGE_VALUE_INFO], 'damage');
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
  return addColumnArrayErrorsToMessage(message, COLUMNS[key], key);
}

function addColumnArrayErrorsToMessage(message, columnInfos, key) {
  const missingLabels = validateColumnArray(columnInfos);
  if (missingLabels) {
    return continueMessage(message, 'must specify properties from ' + key + ' asset: ' + missingLabels);
  }
  return message;
}

const BUILDING_PATH = Object.freeze(['flexibleData', 'buildingPath']);

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
  const {buildingsDiv} = getBuildingsDivs();
  const finishLambda = prepareContainerDivAndShowColumns(buildingsDiv, 'buildings');
  if (getElementFromPath(BUILDING_HAS_GEOMETRY_PATH)) {
    removeAndCreateUl('buildings');
  }
  const buildingSelect = await createAssetDropdown(BUILDING_PATH);
  finishLambda();
  if (!buildingSelect) {
    return null;
  }
  buildingSelect
      .on('change', () => onBuildingChange(buildingSelect, buildingsDiv));
  buildingsDiv.append(buildingSelect);
  if (await shouldDisplayBuildingProperties(buildingSelect.val())) {
    return showRealColumns(buildingsDiv, BUILDING_PATH, 'buildings');
  } else {
    removeAndCreateUl('buildings');
  }
}

const povertyPath = ['flexibleData', 'povertyPath'];

async function onSetFlexibleDisaster(assetData) {
  startPending();
  $('#state-based-disaster-asset-selection-table').hide();
  $('#flexible-data').show();
  initializeScoreBoundsMapFromAssetData(assetData);
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
  setGeographyDivVisibility(!getElementFromPath(POVERTY_HAS_GEOMETRY_PATH));
  return Promise.all([initializeGeography(), initializeBuildingSourceBuildings(), initializePoverty()]).then(finishPending);
}

async function initializePoverty() {
  const povertyDiv = $('#flexible-poverty-asset-data');
  const finishLambda = prepareContainerDivAndShowColumns(povertyDiv, 'poverty');
  showSpecialPovertyColumn(null);
  const povertySelect = await createAssetDropdown(povertyPath);
  finishLambda();
  if (!povertySelect) {
    return;
  }
  povertySelect
      .on('change', () => onPovertyChange(povertySelect, povertyDiv));
  povertyDiv.append(povertySelect);
  const propertyNamesPromise = showRealColumns(povertyDiv, povertyPath, 'poverty');
  return processPovertyAsset(propertyNamesPromise, povertySelect.val(), povertyDiv);
}

async function onPovertyChange(povertySelect, povertyDiv) {
  handleAssetDataChange(await povertyHasGeometry(povertySelect.val()), POVERTY_HAS_GEOMETRY_PATH);
  processPovertyAsset(writeSelectAndGetPropertyNames(povertySelect, povertyPath), povertySelect.val(), povertyDiv);
}

const geographyPath = ['flexibleData', 'geographyPath'];

async function processPovertyAsset(propertyNamesPromise, assetName, povertyDiv) {
  const geographyPromise = doGeographyForPoverty(assetName);
  const propertyNames = assetName ? await propertyNamesPromise : [];
  if (!propertyNames) {
    // If we've switched assets or not a real asset, do nothing.
    return null;
  }
  if (assetName) {
    finishPending();
  }
  showColumns(propertyNames, povertyDiv, 'poverty');
  showSpecialPovertyColumn(propertyNames);
  return geographyPromise;
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
  // Should complete instantly since already finished this call earlier.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  return disasterAssets.get(povertyAssetName).hasGeometry;
}

async function initializeGeography() {
  const geographyDiv = getGeographyDiv();
  const finishLambda = prepareContainerDivAndShowColumns(geographyDiv, 'geography');
  const geographySelect = (await createAssetDropdown(geographyPath, false));
  finishLambda();
  if (!geographySelect) {
    return;
  }
  geographySelect
          .on('change',
              () => onGeographyChange(geographySelect, geographyDiv));
  geographyDiv.append(geographySelect);
  return showRealColumns(geographyDiv, geographyPath, 'geography');
}

async function onGeographyChange(geographySelect, geographyDiv) {
  const propertyNames = await writeSelectAndGetPropertyNames(geographySelect,
      geographyDiv);
  if (propertyNames) {
    showColumns(propertyNames, geographyDiv, 'geography');
  }
  finishPending();
}

async function onBuildingChange(buildingSelect, buildingDiv) {
  const noGeometry = await shouldDisplayBuildingProperties(buildingSelect.val());
  handleAssetDataChange(!noGeometry, BUILDING_HAS_GEOMETRY_PATH);
  if (noGeometry) {
    showColumns(null, buildingDiv, 'buildings');
    const propertyNames = await writeSelectAndGetPropertyNames(buildingSelect,
        BUILDING_PATH);
    if (propertyNames) {
      showColumns(propertyNames, buildingDiv, 'buildings');
    }
    finishPending();
  } else {
    removeAndCreateUl('buildings');
    validateFlexibleUserFields();
  }
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


const BUILDING_HAS_GEOMETRY_PATH = ['flexibleData', 'buildingHasGeometry'];

function showSpecialPovertyColumn(properties) {
  const enabledProperties = createEnabledProperties(properties);
  $('#buildings-poverty-select-span')
      .show()
      .empty()
      .append(createColumnDropdown(
          enabledProperties, BUILDING_KEY_PATH));
}

async function showRealColumns(div, path, key) {
  showColumns(null, div, key);
  const propertyNames = await verifyAsset(path, null);
  if (propertyNames) {
    showColumns(propertyNames, div, key);
  }
  return propertyNames;
}

function prepareContainerDivAndShowColumns(outerDiv, assetKey) {
  const result = prepareContainerDiv(outerDiv, assetKey);
  showColumns(null, outerDiv, assetKey);
  return result;
}

function showColumns(properties, div, key) {
  const enabledProperties = createEnabledProperties(properties);
  const attrList = removeAndCreateUl(key);
  for (const columnInfo of COLUMNS[key]) {
    attrList.append(
        createSelectListItemFromColumnInfo(columnInfo, enabledProperties));
  }
  div.append(attrList);
}

async function createAssetDropdown(propertyPath, enableAll = true) {
  const currentDisaster = getDisaster();
  // Same promise as waited on for many assets. Since getDisasterAssetsFromEe
  // deduplicates, this is fine.
  addPendingOperation();
  const disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  removePendingOperation();
  if (currentDisaster !== getDisaster()) {
    return null;
  }
  const allEnabledDisasterAssets = new Map();
  if (enableAll) {
    // Don't disable any feature collections.
    for (const [name, attributes] of disasterAssets) {
      const newAttributes = Object.assign({}, attributes);
      newAttributes.disabled = false;
      allEnabledDisasterAssets.set(name, newAttributes);
    }
  }
  return createAssetDropdownWithNone(enableAll ? allEnabledDisasterAssets : disasterAssets, propertyPath);
}

///////////////////////////////////////////////////
// Building-source radio-button-related methods. //
///////////////////////////////////////////////////

/**
 * Initializes flexible elements that can be interacted with before Firestore
 * finishes: the radio buttons determining the source of damage.
 */
function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  const divs = getBuildingsDivs();
  $('#buildings-source-buildings').on('click', () => {
    handleAssetDataChange(BuildingSource.BUILDING, BUILDING_SOURCE_PATH);
    showDivsForBuildingSourceBuildings();
  });
  $('#buildings-source-poverty').on('click', () => {
    handleAssetDataChange(BuildingSource.POVERTY, BUILDING_SOURCE_PATH);
    showDivsForBuildingSourcePoverty();
  });
  $('#buildings-source-damage').on('click', () => {
    handleAssetDataChange(BuildingSource.DAMAGE, BUILDING_SOURCE_PATH);
    showDivsForBuildingSourceDamage();
  });
}

function showDivsForBuildingSourceBuildings() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.hide();
}

function showDivsForBuildingSourceDamage() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.hide();
}

function showDivsForBuildingSourcePoverty() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.show();
}

function getBuildingsDivs() {
  return {
    buildingsDiv: $('#buildings-source-buildings-div'),
    povertyDiv: $('#buildings-source-poverty-div')
  };
}
