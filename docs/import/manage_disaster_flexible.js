import {isUserProperty} from '../property_names.js';
import {getDisaster} from '../resources.js';
import {
  createPendingSelect,
  getDisasterAssetsFromEe
} from './list_ee_assets.js';
import {LayerType} from '../firebase_layers.js';
import {
  createAssetDropdownWithNone,
  createDropdown, getElementFromPath,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData, onNonDamageAssetSelect,
  SameDisasterChecker, SameSelectChecker, verifyAsset
} from './manage_disaster_base.js';

export {onSetFlexibleDisaster, initializeFlexible, validateFlexibleUserFields};

function validateFlexibleUserFields() {}

function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  const buildingsSourceBuildings = $('#buildings-source-buildings-div');
  const buildingsSourcePoverty = $('#buildings-source-poverty-div');
  const useDamageForBuildingsPath = ['useDamageForBuildings'];
  $('#buildings-source-damage').on('click', () => {
    buildingsSourceBuildings.hide();
    buildingsSourcePoverty.hide();
    handleAssetDataChange(true, useDamageForBuildingsPath);
  });
  $('#buildings-source-buildings').on('click', () => {
    buildingsSourceBuildings.show();
    buildingsSourcePoverty.hide();
    handleAssetDataChange(false, useDamageForBuildingsPath);
  });
  $('#buildings-source-poverty').on('click', () => {
    buildingsSourceBuildings.hide();
    buildingsSourcePoverty.show();
    handleAssetDataChange(false, useDamageForBuildingsPath);
  });
}

const sameDisasterChecker = new SameDisasterChecker();

const povertyId = 'select-flexible-poverty';
const povertyPath = ['flexibleData', 'povertyPath'];

async function onSetFlexibleDisaster(assetData) {
  const currentDisaster = getDisaster();
  sameDisasterChecker.reset();
  $('#state-based-disaster-asset-selection-table').hide();
  $('#flexible-data').show();
  initializeScoreBoundsMapFromAssetData(assetData);
  const povertyDiv = $('#flexible-poverty-asset-data');
  povertyDiv.empty().show();
  povertyDiv.append($(document.createElement('span')).text('Poverty asset path: '));
  const pendingSelect = createPendingSelect();
  povertyDiv.append(pendingSelect);
  // Same promise as waited on in onSetDisaster. Since getDisasterAssetsFromEe
  // deduplicates, this is fine.
  const disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  if (!sameDisasterChecker.markDoneIfStillValid()) {
    return;
  }
  const allEnabledDisasterAssets = new Map();
  // Don't disable any feature collections.
  for (const [name, attributes] of disasterAssets) {
    const newAttributes = Object.assign({}, attributes);
    newAttributes.disabled = false;
    allEnabledDisasterAssets.set(name, newAttributes);
  }
  const povertySelect = createAssetDropdownWithNone(allEnabledDisasterAssets, povertyPath)
      .prop('id', povertyId)
      .on('change', () => onPovertyChange(disasterAssets, povertySelect, povertyDiv));
  pendingSelect.remove();
  povertyDiv.append(povertySelect);
  const samePovertyChecker = new SameSelectChecker(povertySelect);
  const propertyNames = await verifyAsset(povertyId, null);
  if (!propertyNames || !samePovertyChecker.markDoneIfStillValid()) {
    return;
  }
  processPovertyAsset(propertyNames, disasterAssets, povertySelect, povertyDiv);
  // TODO(janakr): we could speed up/precache checking for the geography asset
  //  here, rather than implicitly chaining off of the poverty check.
}

async function onPovertyChange(disasterAssets, povertySelect, povertyDiv) {
  const samePovertyChecker = new SameSelectChecker(povertySelect);
  const propertyNames = await onNonDamageAssetSelect(povertyPath, null, povertyId);
  if (!propertyNames || !samePovertyChecker.markDoneIfStillValid()) {
    // If we've switched assets, do nothing.
    return;
  }
  return processPovertyAsset(propertyNames, disasterAssets, povertySelect, povertyDiv);
}

const geographyId = 'select-flexible-geography';

async function processPovertyAsset(propertyNames, disasterAssets, povertySelect, povertyDiv) {
  povertyPropertiesProcessor(propertyNames, povertySelect, povertyDiv);
  const geographyDiv = $('#flexible-geography-asset-data');
  const geographyPath = ['flexibleData', 'geographyPath'];
  const attributes = disasterAssets.get(povertySelect.val());
  if (!attributes) {
    geographyDiv.hide();
  } else if (attributes.hasGeometry) {
    if (getElementFromPath(geographyPath)) {
      // Get rid of geography path if it was set.
      handleAssetDataChange(null, geographyPath);
    }
    geographyDiv.hide();
  } else {
    const geographySelect = createAssetDropdownWithNone(disasterAssets, geographyPath)
        .prop('id', geographyId)
        .on('change', () => onGeographyChange(geographySelect, geographyDiv));
    geographyDiv.append(geographySelect);
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
  const propertyNames = await onNonDamageAssetSelect(povertyPath, null, povertyId);
  if (!propertyNames || !sameGeographyChecker.markDoneIfStillValid()) {
    return;
  }
  processGeographyAsset(propertyNames, geographyDiv);
}

function processGeographyAsset(propertyNames, geographyDiv) {
  const geographyAttrList = removeAndCreateUl(geographyAttrUl)
      .append(createPropertyListItem('Poverty rate column: ', createEnabledProperties(propertyNames), ['flexibleData', 'geographyGeoid']));
  geographyDiv.append(geographyAttrList);

}

const povertyAttrsUl = 'poverty-attrs-ul';

function povertyPropertiesProcessor(properties, povertySelect, povertyDiv) {
  const enabledProperties = createEnabledProperties(properties);
  const povertyAttrList = removeAndCreateUl(povertyAttrsUl)
      .append(createPropertyListItem('Poverty rate column: ', enabledProperties, ['flexibleData', 'povertyRateKey']))
      .append(createPropertyListItem('District description column (human-readable description of each region): ', enabledProperties, ['flexibleData', 'districtDescriptionKey']))
      .append(createPropertyListItem('District identifier column (typically numeric/short string): ', enabledProperties, ['flexibleData',
    'povertyGeoid']));
  povertyDiv.append(povertyAttrList);
  $('#buildings-poverty-select-span').empty().append(createColumnDropdown(enabledProperties, ['flexibleData', 'buildingKey']));
}

function createColumnDropdown(properties, path) {
  const select = createAssetDropdownWithNone(properties, path);
  return select.on('change', () => handleAssetDataChange(select.val(), path));
}

function createEnabledProperties(properties) {
  properties = properties.filter(isUserProperty);

  // TODO(janakdr): Do async add_layer processing so we can warn if column not
  //  ok for whatever user wants it for?
  return properties.map((p) => [p, {disabled: false}]);
}

function createPropertyListItem(label, enabledProperties, firestorePath) {
  return $(document.createElement('li')).append(label + ': ').append(createColumnDropdown(enabledProperties, firestorePath));
}

function removeAndCreateUl(id) {
  $('#' + id).remove();
  return $(document.createElement('ul')).prop('id', id);
}
