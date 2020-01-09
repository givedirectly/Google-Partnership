import {isUserProperty} from '../property_names.js';
import {getDisaster} from '../resources.js';
import {
  createPendingSelect,
  getDisasterAssetsFromEe
} from './list_ee_assets.js';
import {
  createAssetDropdownWithNone,
  createColumnDropdown, createEnabledProperties, createPropertyListItem,
  getElementFromPath,
  getPropertyNames,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData,
  onNonDamageAssetSelect, removeAndCreateUl,
  SameDisasterChecker,
  SameSelectChecker,
  verifyAsset
} from './manage_disaster_base.js';

export {onSetFlexibleDisaster, initializeFlexible, validateFlexibleUserFields};

function validateFlexibleUserFields() {}

const buildingsSameDisasterChecker = new SameDisasterChecker();

const buildingPath = ['flexibleData', 'buildingPath'];

const buildingId = 'select-building-asset';

function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  const buildingsSourceBuildings = $('#buildings-source-buildings-div');
  const buildingsSourcePoverty = $('#buildings-source-poverty-div');
  const useDamageForBuildingsPath = ['useDamageForBuildings'];
  const 
  $('#buildings-source-damage').on('click', () => {
    handleAssetDataChange(true, useDamageForBuildingsPath);
    buildingsSourceBuildings.hide();
    buildingsSourcePoverty.hide();
  });
  $('#buildings-source-buildings').on('click', async () => {
    handleAssetDataChange(false, useDamageForBuildingsPath);
    buildingsSameDisasterChecker.reset();
    buildingsSourcePoverty.hide();
    const buildingSelect = await createAllAssetDropdown(buildingsSourceBuildings, 'Buildings asset path', buildingPath, buildingsSameDisasterChecker);
    buildingSelect
        .prop('id', buildingId)
        .on('change', () => onBuildingChange(buildingSelect, buildingsSourceBuildings));
    return onBuildingChange(buildingSelect, buildingsSourceBuildings, () => getPropertyNames(buildingId));
  });
  $('#buildings-source-poverty').on('click', () => {
    handleAssetDataChange(false, useDamageForBuildingsPath);
    buildingsSourceBuildings.hide();
    buildingsSourcePoverty.show();
    if (getElementFromPath(buildingPath)) {
      handleAssetDataChange(null, buildingPath);
    }
  });
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
  const povertyDiv = $('#flexible-poverty-asset-data');
  const povertySelect = await createAllAssetDropdown(povertyDiv, 'Poverty asset path', povertyPath, sameDisasterChecker);
  if (!povertySelect) {
    return;
  }
  povertySelect.prop('id', povertyId)
  .on('change', () => onPovertyChange(povertySelect, povertyDiv));
  const propertyNames = await getPropertyNames(povertyId);
  if (!propertyNames) {
    return;
  }
  return processPovertyAsset(propertyNames, povertySelect, povertyDiv);
  // TODO(janakr): we could speed up/precache checking for the geography asset
  //  here, rather than implicitly chaining inside processPovertyAsset.
}

async function createAllAssetDropdown(outerDiv, labelText, propertyPath, checker) {
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
  const select = createAssetDropdownWithNone(allEnabledDisasterAssets, propertyPath);
  pendingSelect.remove();
  outerDiv.append(select);
  return select;
}

async function onPovertyChange(povertySelect, povertyDiv) {
  const samePovertyChecker = new SameSelectChecker(povertySelect);
  const propertyNames = await onNonDamageAssetSelect(povertyPath, null, povertyId);
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
    geographyDiv.empty().append($(document.createElement('span')).text('Geography asset path: '));

    const geographySelect = createAssetDropdownWithNone(disasterAssets, geographyPath)
        .prop('id', geographyId)
        .on('change', () => onGeographyChange(geographySelect, geographyDiv));
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
  const propertyNames = await onNonDamageAssetSelect(geographyPath, null, geographyId);
  if (!propertyNames || !sameGeographyChecker.markDoneIfStillValid()) {
    return;
  }
  processGeographyAsset(propertyNames, geographyDiv);
}

const districtIdLabel = 'District identifier column (to match with poverty asset\'s)';

function processGeographyAsset(propertyNames, geographyDiv) {
  const geographyAttrList = removeAndCreateUl(geographyAttrUl)
      .append(createPropertyListItem(districtIdLabel, createEnabledProperties(propertyNames), ['flexibleData', 'geographyGeoid']));
  geographyDiv.append(geographyAttrList);
}

const buildingAttrUl = 'building-attr-ul';

async function onBuildingChange(buildingSelect, buildingDiv, propertyNamesLambda = null) {
  const writeLambda = propertyNamesLambda ? () => null : () => onNonDamageAssetSelect(buildingPath, null, buildingId);
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
  buildingAttrList.append(createPropertyListItem(districtIdLabel, createEnabledProperties(propertyNames), ['flexibleData', 'buildingGeoid']));
  buildingDiv.append(buildingAttrList);
}

const povertyAttrsUl = 'poverty-attrs-ul';

function povertyPropertiesProcessor(properties, povertySelect, povertyDiv) {
  const enabledProperties = createEnabledProperties(properties);
  const povertyAttrList = removeAndCreateUl(povertyAttrsUl)
      .append(createPropertyListItem('Poverty rate column', enabledProperties, ['flexibleData', 'povertyRateKey']))
      .append(createPropertyListItem('District description column (human-readable description of each region)', enabledProperties, ['flexibleData', 'districtDescriptionKey']))
      .append(createPropertyListItem('District identifier column (typically numeric/short string)', enabledProperties, ['flexibleData',
    'povertyGeoid']));
  povertyDiv.append(povertyAttrList);
  $('#buildings-poverty-select-span').empty().append(createColumnDropdown(enabledProperties, ['flexibleData', 'buildingKey']));
}
