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
  createSelectFromColumnInfo,
  DAMAGE_COLUMN_INFO,
  DAMAGE_VALUE_INFO,
  damageAssetPresent,
  getElementFromPath,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData,
  makeIdFromPath,
  removeAndCreateUl,
  SameDisasterChecker,
  validateColumnArray,
  writeSelectAndGetPropertyNames,
  verifyAsset,
  showProcessButtonWithDamage,
  showProcessButton,
} from './manage_disaster_base.js';

export {initializeFlexible, onSetFlexibleDisaster, validateFlexibleUserFields};

const MISSING_BUILDINGS_TAIL = ' (choose damage asset as buildings source for now if you don\'t need buildings)';

function validateFlexibleUserFields() {
  if (pendingOperations > 0) {
    showProcessButton('Pending...');
    return;
  }
  let message = '';
  let optionalMessage = '';
  const povertyAssetName = $('#' + povertyId).val();
  if (povertyAssetName) {
    message = checkColumns(message, 'poverty');
    if (!getElementFromPath(POVERTY_HAS_GEOMETRY_PATH)) {
      const geographyAssetName = $('#' + geographyId).val();
      if (geographyAssetName) {
        message = checkColumns(message, 'geography');
      } else {
        message = continueMessage(message, 'missing geography asset');
      }
    }
  } else {
    message = continueMessage(message, 'missing poverty asset');
  }
  const buildingSource = getElementFromPath(buildingSourcePath);
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
        const buildingAssetName = $('#' + buildingId).val();
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
  showProcessButtonWithDamage(message, optionalMessage);
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

const buildingPath = ['flexibleData', 'buildingPath'];

const buildingId = 'select-building-asset';

const buildingSourcePath = Object.freeze(['flexibleData', 'buildingSource']);

function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  $('#buildings-source-buildings').on('click', () => {
    handleAssetDataChange(BuildingSource.BUILDING, buildingSourcePath);
    initializeBuildingSourceBuildings();
  });
  $('#buildings-source-poverty').on('click', () => {
    handleAssetDataChange(BuildingSource.POVERTY, buildingSourcePath);
    processBuildingSourcePoverty();
  });
  $('#buildings-source-damage').on('click', () => {
    handleAssetDataChange(BuildingSource.DAMAGE, buildingSourcePath);
    processBuildingSourceDamage();
  });
}

function processBuildingSourceDamage() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.hide();
}

async function initializeBuildingSourceBuildings() {
  const {buildingsDiv, povertyDiv} = getBuildingsDivs();
  povertyDiv.hide();
  const pendingSelect = prepareContainerDiv(buildingsDiv, 'buildings');
  if (getElementFromPath(BUILDING_HAS_GEOMETRY_PATH)) {
    removeAndCreateUl('buildings');
  }
  const buildingSelect = await createAssetDropdown(buildingPath);
  pendingSelect.remove();
  if (!buildingSelect) {
    return;
  }
  buildingSelect.prop('id', buildingId)
      .on('change', () => onBuildingChange(buildingSelect, buildingsDiv));
  buildingsDiv.append(buildingSelect);
  if (await shouldDisplayBuildingProperties(buildingSelect.val())) {
    return showRealColumns(buildingsDiv, buildingId, 'buildings');
  } else {
    removeAndCreateUl('buildings');
  }
}

function processBuildingSourcePoverty() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.show();
  if (getElementFromPath(buildingPath)) {
    handleAssetDataChange(null, buildingPath);
  }
}

function getBuildingsDivs() {
  return {
    buildingsDiv: $('#buildings-source-buildings-div'),
    povertyDiv: $('#buildings-source-poverty-div')
  };
}

const sameDisasterChecker = new SameDisasterChecker();

const povertyId = 'select-flexible-poverty';
const povertyPath = ['flexibleData', 'povertyPath'];

async function onSetFlexibleDisaster(assetData) {
  sameDisasterChecker.reset();
  $('#state-based-disaster-asset-selection-table').hide();
  $('#flexible-data').show();
  $('#flexible-geography-asset-data').hide();
  initializeScoreBoundsMapFromAssetData(assetData);
  let buildingsPromise = Promise.resolve();
  const {buildingSource} = assetData.flexibleData;
  if (buildingSource !== null) {
    switch (buildingSource) {
      case BuildingSource.BUILDING:
        buildingsPromise = initializeBuildingSourceBuildings();
        $('#buildings-source-buildings').prop('checked', true);
        break;
      case BuildingSource.POVERTY:
        processBuildingSourcePoverty();
        $('#buildings-source-poverty').prop('checked', true);
        break;
      case BuildingSource.DAMAGE:
        processBuildingSourceDamage();
        $('#buildings-source-damage').prop('checked', true);
        break;
    }
  }
  if (!getElementFromPath(POVERTY_HAS_GEOMETRY_PATH)) {
    // If it turns out that geography should be hidden, processPovertyAsset will
    // do that after this has made geography visible, so it will end up hidden.
    initializeGeography();
  }
  return Promise.all([buildingsPromise, initializePoverty()]);
}

async function initializePoverty() {
  const povertyDiv = $('#flexible-poverty-asset-data');
  const pendingSelect = prepareContainerDiv(povertyDiv, 'poverty');
  showSpecialPovertyColumn(null);
  const povertySelect = await createAssetDropdown(povertyPath);
  pendingSelect.remove();
  if (!povertySelect) {
    return;
  }
  povertySelect.prop('id', povertyId)
      .on('change', () => onPovertyChange(povertySelect, povertyDiv));
  povertyDiv.append(povertySelect);
  const propertyNamesPromise = showRealColumns(povertyDiv, povertyId, 'poverty');
  return processPovertyAsset(propertyNamesPromise, povertySelect.val(), povertyDiv);

}

function onPovertyChange(povertySelect, povertyDiv) {
  const propertyNamesPromise =
      writeSelectAndGetPropertyNames(povertySelect, povertyId, povertyPath);
  return processPovertyAsset(propertyNamesPromise, povertySelect.val(), povertyDiv);
}

const geographyId = 'select-flexible-geography';
const geographyPath = ['flexibleData', 'geographyPath'];

async function processPovertyAsset(propertyNamesPromise, assetName, povertyDiv) {
  const geographyPromise = doGeographyForPoverty(assetName);
  const propertyNames = assetName ? await propertyNamesPromise : [];
  if (!propertyNames) {
    // If we've switched assets, do nothing.
    return null;
  }
  showColumns(propertyNames, povertyDiv, 'poverty');
  showSpecialPovertyColumn(propertyNames);
  return geographyPromise;
}

const POVERTY_HAS_GEOMETRY_PATH = ['flexibleData', 'povertyHasGeometry'];

async function doGeographyForPoverty(povertyAssetName) {
  // Should complete instantly since already finished this call earlier.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  const hasGeometry = disasterAssets.get(povertyAssetName).hasGeometry;
  handleAssetDataChange(hasGeometry, POVERTY_HAS_GEOMETRY_PATH);
  if (hasGeometry) {
    $('#flexible-geography-asset-data').hide();
  } else {
    return initializeGeography();
  }
}

const geographyAttrUl = 'geography-attr-ul';

async function initializeGeography() {
  const geographyDiv = $('#flexible-geography-asset-data');
  const pendingSelect = prepareContainerDiv(geographyDiv, 'geography');
  const geographySelect = (await createAssetDropdown(geographyPath, false));
  pendingSelect.remove();
  if (!geographySelect) {
    return;
  }
  geographySelect
          .prop('id', geographyId)
          .on('change',
              () => onGeographyChange(geographySelect, geographyDiv));
  geographyDiv.append(geographySelect);
  return showRealColumns(geographyDiv, geographyId, 'geography');
}

async function onGeographyChange(geographySelect, geographyDiv) {
  const propertyNames = await writeSelectAndGetPropertyNames(geographySelect, geographyId, geographyDiv);
  if (propertyNames) {
    showGeographyColumns(propertyNames, geographyDiv);
  }
}

const DISTRICT_ID_LABEL = 'district identifier column';
const DISTRICT_ID_EXPLANATION = 'to match with poverty asset\'s';

function showGeographyColumns(propertyNames, geographyDiv) {
  const geographyAttrList =
      removeAndCreateUl(geographyAttrUl)
          .append(createSelectFromColumnInfo(
              GEOGRAPHY_GEOID_INFO, createEnabledProperties(propertyNames)));
  geographyDiv.append(geographyAttrList);
}

async function onBuildingChange(buildingSelect, buildingDiv) {
  const propertyNamesPromise = writeSelectAndGetPropertyNames(buildingSelect, buildingId, buildingPath);
  const noGeometry = await shouldDisplayBuildingProperties(buildingSelect.val());
  handleAssetDataChange(!noGeometry, BUILDING_HAS_GEOMETRY_PATH);
  if (noGeometry) {
    showColumns(null, buildingDiv, 'buildings');
    const propertyNames = await propertyNamesPromise;
    if (propertyNames) {
      showColumns(propertyNames, buildingDiv, 'buildings');
    }
  } else {
    removeAndCreateUl('buildings');
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

const BUILDING_KEY_PATH = ['flexibleData', 'buildingKey'];

const BUILDING_GEOID_PATH = ['flexibleData', 'buildingGeoid'];

const BUILDING_HAS_GEOMETRY_PATH = ['flexibleData', 'buildingHasGeometry'];

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

function showSpecialPovertyColumn(properties) {
  const enabledProperties = createEnabledProperties(properties);
  $('#buildings-poverty-select-span')
      .show()
      .empty()
      .append(createColumnDropdown(
          enabledProperties, BUILDING_KEY_PATH));
}

async function showRealColumns(div, id, key) {
  showColumns(null, div, key);
  pendingOperations++;
  const propertyNames = await verifyAsset(id, null);
  pendingOperations--;
  if (propertyNames) {
    showColumns(propertyNames, div, key);
  }
  return propertyNames;
}

function showColumns(properties, div, key) {
  const enabledProperties = createEnabledProperties(properties);
  const attrList = removeAndCreateUl(key);
  for (const columnInfo of COLUMNS[key]) {
    attrList.append(
        createSelectFromColumnInfo(columnInfo, enabledProperties));
  }
  div.append(attrList);
}

function prepareContainerDiv(outerDiv, assetKey) {
  outerDiv.empty().show();
  outerDiv.append($(document.createElement('span')).text(capitalizeFirstLetter(assetKey) + ' asset path: '));
  const pendingSelect = createPendingSelect();
  outerDiv.append(pendingSelect);
  showColumns(null, outerDiv, assetKey);
  return pendingSelect;
}

async function createAssetDropdown(propertyPath, enableAll = true) {
  const currentDisaster = getDisaster();
  pendingOperations++;
  // Same promise as waited on for many assets. Since getDisasterAssetsFromEe
  // deduplicates, this is fine.
  const disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  pendingOperations--;
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
