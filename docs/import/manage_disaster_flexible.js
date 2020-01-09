import {getDisaster} from '../resources.js';

import {createPendingSelect, getDisasterAssetsFromEe} from './list_ee_assets.js';
import {createAssetDropdownWithNone, createColumnDropdown, createEnabledProperties, createPropertyListItem, createSelectFromColumnInfo, DAMAGE_COLUMN_INFO, DAMAGE_NODAMAGE_VALUE_INFO, damageAssetPresent, getElementFromPath, getPropertyNames, handleAssetDataChange, initializeScoreBoundsMapFromAssetData, onNonDamageAssetSelect, removeAndCreateUl, SameDisasterChecker, SameSelectChecker, setProcessButtonText, validateColumnArray, validateColumnSelect, verifyAsset,} from './manage_disaster_base.js';

export {initializeFlexible, onSetFlexibleDisaster, validateFlexibleUserFields};

async function validateFlexibleUserFields() {
  let message = '';
  let optionalMessage = '';
  const povertyAssetName = $('#' + povertyId).val();
  if (!povertyAssetName) {
    message = 'Missing poverty asset';
  } else {
    const missingLabels = validateColumnArray(POVERTY_COLUMNS);
    if (missingLabels) {
      message = 'Must specify columns from poverty asset: ' + missingLabels;
    }
    const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
    if (!disasterAssets.get(povertyAssetName).hasGeometry) {
      const geographyAssetName = $('#' + geographyId).val();
      if (!geographyAssetName) {
        if (message) {
          message += ', g';
        } else {
          message = 'G';
        }
        message += 'eography asset required';
      } else {
        const missing = validateColumnSelect(GEOGRAPHY_GEOID_INFO);
        if (missing) {
          if (message) {
            message += ', m';
          } else {
            message = 'M';
          }
          message += 'issing geography asset\'s ' + missing;
        }
      }
    }
    if (getElementFromPath(useDamageForBuildingsPath)) {
      const hasDamageAsset = damageAssetPresent();
      if (hasDamageAsset) {
        const missingLabels = [DAMAGE_COLUMN_INFO, DAMAGE_NODAMAGE_VALUE_INFO]
                                  .map(validateColumnSelect)
                                  .filter((c) => c);
        if (missingLabels) {
          message += (message ? ', m' : 'M') +
              'issing damage asset attributes when all buildings in damage asset: ' +
              missingLabels;
        }
      } else {
        optionalMessage = 'Building counts';
      }
    } else if ($('#buildings-source-buildings').is(':checked')) {
      const buildingAssetName = $('#' + buildingId).val();
      if (buildingAssetName) {
        if (!disasterAssets.get(buildingAssetName).hasGeometry) {
        }
      }
    }
  }

  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  const povertyAttributes = disasterAssets.get(povertyAssetName);
}

const buildingPath = ['flexibleData', 'buildingPath'];

const buildingId = 'select-building-asset';

const useDamageForBuildingsPath = Object.freeze(['useDamageForBuildings']);

function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  $('#buildings-source-damage').on('click', () => {
    handleAssetDataChange(true, useDamageForBuildingsPath);
    processUseDamageForBuildings();
  });
  $('#buildings-source-buildings').on('click', () => {
    handleAssetDataChange(false, useDamageForBuildingsPath);
    processSeparateBuildingsAsset();
  });
  $('#buildings-source-poverty').on('click', () => {
    handleAssetDataChange(false, useDamageForBuildingsPath);
    processBuildingsInPoverty();
  });
}

function processUseDamageForBuildings() {
  const divs = getBuildingsDivs();
  divs.buildingsDiv.hide();
  divs.povertyDiv.hide();
}

const buildingsSameDisasterChecker = new SameDisasterChecker();

async function processSeparateBuildingsAsset() {
  const {buildingsDiv, povertyDiv} = getBuildingsDivs();
  povertyDiv.hide();
  const buildingSelect = await createAllAssetDropdown(
      buildingsDiv, 'Buildings asset path', buildingPath,
      buildingsSameDisasterChecker);
  buildingSelect.prop('id', buildingId)
      .on('change', () => onBuildingChange(buildingSelect, buildingsDiv));
  return onBuildingChange(
      buildingSelect, buildingsDiv, () => getPropertyNames(buildingId));
}

function processBuildingsInPoverty() {
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
  if (getElementFromPath(useDamageForBuildingsPath)) {
    processUseDamageForBuildings();
    $('#buildings-source-damage').prop('checked', true);
  } else if (getElementFromPath(buildingPath)) {
    buildingsPromise = processSeparateBuildingsAsset();
    $('#buildings-source-buildings').prop('checked', true);
  } else {
    processBuildingsInPoverty();
    $('#buildings-source-poverty').prop('checked', true);
  }
  const povertyDiv = $('#flexible-poverty-asset-data');
  const povertySelect = await createAllAssetDropdown(
      povertyDiv, 'Poverty asset path', povertyPath, sameDisasterChecker);
  if (!povertySelect) {
    return;
  }
  povertySelect.prop('id', povertyId)
      .on('change', () => onPovertyChange(povertySelect, povertyDiv));
  const propertyNames = await getPropertyNames(povertyId);
  if (!propertyNames) {
    return;
  }
  return Promise.all([
    buildingsPromise,
    processPovertyAsset(propertyNames, povertySelect, povertyDiv)
  ]);
  // TODO(janakr): we could speed up/precache checking for the geography asset
  //  here, rather than implicitly chaining inside processPovertyAsset.
}

async function createAllAssetDropdown(
    outerDiv, labelText, propertyPath, checker) {
  outerDiv.empty().show();
  outerDiv.append($(document.createElement('span')).text(labelText + ': '));
  const pendingSelect = createPendingSelect();
  outerDiv.append(pendingSelect);
  checker.reset();
  // Same promise as waited on for damage and buildings assets. Since
  // getDisasterAssetsFromEe deduplicates, this is fine.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  if (!checker.markDoneIfStillValid()) {
    return null;
  }
  const allEnabledDisasterAssets = new Map();
  // Don't disable any feature collections.
  for (const [name, attributes] of disasterAssets) {
    const newAttributes = Object.assign({}, attributes);
    newAttributes.disabled = false;
    allEnabledDisasterAssets.set(name, newAttributes);
  }
  const select =
      createAssetDropdownWithNone(allEnabledDisasterAssets, propertyPath);
  pendingSelect.remove();
  outerDiv.append(select);
  return select;
}

async function onPovertyChange(povertySelect, povertyDiv) {
  const samePovertyChecker = new SameSelectChecker(povertySelect);
  const propertyNames =
      await onNonDamageAssetSelect(povertyPath, null, povertyId);
  if (!propertyNames || !samePovertyChecker.markDoneIfStillValid()) {
    // If we've switched assets, do nothing.
    return;
  }
  return processPovertyAsset(propertyNames, povertySelect, povertyDiv);
}

const geographyId = 'select-flexible-geography';
const geographyPath = ['flexibleData', 'geographyPath'];

async function processPovertyAsset(propertyNames, povertySelect, povertyDiv) {
  povertyPropertiesProcessor(propertyNames, povertySelect, povertyDiv);
  const geographyDiv = $('#flexible-geography-asset-data');
  // Should complete instantly since already finished this call earlier.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  const attributes = disasterAssets.get(povertySelect.val());
  if (!attributes) {
    geographyDiv.hide();
  } else if (attributes.hasGeometry) {
    if (getElementFromPath(geographyPath)) {
      // Get rid of geography path if it was set. Nothing needs to wait for the
      // write to finish.
      handleAssetDataChange(null, geographyPath);
    }
    geographyDiv.hide();
  } else {
    geographyDiv.empty().append(
        $(document.createElement('span')).text('Geography asset path: '));

    const geographySelect =
        createAssetDropdownWithNone(disasterAssets, geographyPath)
            .prop('id', geographyId)
            .on('change',
                () => onGeographyChange(geographySelect, geographyDiv));
    geographyDiv.append(geographySelect).show();
    const sameGeographyChecker = new SameSelectChecker(geographySelect);
    const propertyNames = await verifyAsset(geographyId, null);
    if (!propertyNames || !sameGeographyChecker.markDoneIfStillValid()) {
      return;
    }
    processGeographyAsset(propertyNames, geographyDiv);
  }
}

const geographyAttrUl = 'geography-attr-ul';

async function onGeographyChange(geographySelect, geographyDiv) {
  const sameGeographyChecker = new SameSelectChecker(geographySelect);
  const propertyNames =
      await onNonDamageAssetSelect(geographyPath, null, geographyId);
  if (!propertyNames || !sameGeographyChecker.markDoneIfStillValid()) {
    return;
  }
  processGeographyAsset(propertyNames, geographyDiv);
}

const DISTRICT_ID_LABEL = 'district identifier column';
const DISTRICT_ID_EXPLANATION = 'to match with poverty asset\'s';

const GEOGRAPHY_GEOID_INFO = {
  label: DISTRICT_ID_LABEL,
  explanation: DISTRICT_ID_EXPLANATION,
  path: ['flexibleData', 'geographyGeoid']
};

function processGeographyAsset(propertyNames, geographyDiv) {
  const geographyAttrList =
      removeAndCreateUl(geographyAttrUl)
          .append(createSelectFromColumnInfo(
              GEOGRAPHY_GEOID_INFO, createEnabledProperties(propertyNames)));
  geographyDiv.append(geographyAttrList);
}

const buildingAttrUl = 'building-attr-ul';

const BUILDING_GEOID_INFO = {
  label: DISTRICT_ID_LABEL,
  explanation: DISTRICT_ID_EXPLANATION,
  path: ['flexibleData', 'buildingGeoid']
};

async function onBuildingChange(
    buildingSelect, buildingDiv, propertyNamesLambda = null) {
  const writeLambda = propertyNamesLambda ?
      () => null :
      () => onNonDamageAssetSelect(buildingPath, null, buildingId);
  propertyNamesLambda = propertyNamesLambda ? propertyNamesLambda : writeLambda;
  const buildingAttrList = removeAndCreateUl(buildingAttrUl);
  const assetName = buildingSelect.val();
  if (!assetName) {
    // Nothing to be done here besides basic operations.
    return writeLambda();
  }
  // Should complete instantly.
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  const attributes = disasterAssets.get(assetName);
  if (attributes.hasGeometry) {
    // Buildings have geometry, so we are intersecting them. Nothing to do here.
    return writeLambda();
  }
  const sameBuildingChecker = new SameSelectChecker(buildingSelect);
  const propertyNames = await propertyNamesLambda();
  if (!propertyNames || !sameBuildingChecker.markDoneIfStillValid()) {
    return;
  }
  buildingAttrList.append(createSelectFromColumnInfo(
      BUILDING_GEOID_INFO, createEnabledProperties(propertyNames)));
  buildingDiv.append(buildingAttrList);
}

const povertyAttrsUl = 'poverty-attrs-ul';

const POVERTY_COLUMNS = [
  {label: 'poverty rate column', path: 'povertyRateKey'},
  {
    label: 'district description column',
    explanation: 'human-readable description of each region',
    path: 'districtDescriptionKey'
  },
  {
    label: 'district identifier column',
    explanation: 'typically a number or short string',
    path: 'povertyGeoid'
  },

];

function povertyPropertiesProcessor(properties, povertySelect, povertyDiv) {
  const enabledProperties = createEnabledProperties(properties);
  const povertyAttrList = removeAndCreateUl(povertyAttrsUl);
  for (const columnInfo of POVERTY_COLUMNS) {
    povertyAttrList.append(
        createSelectFromColumnInfo(columnInfo, enabledProperties));
  }
  povertyDiv.append(povertyAttrList);
  $('#buildings-poverty-select-span')
      .empty()
      .append(createColumnDropdown(
          enabledProperties, ['flexibleData', 'buildingKey']));
}
