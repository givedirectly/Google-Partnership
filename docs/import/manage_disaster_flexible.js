import {isUserProperty} from '../property_names.js';
import {getDisaster} from '../resources.js';
import {
  createPendingSelect,
  getDisasterAssetsFromEe
} from './list_ee_assets.js';
import {LayerType} from '../firebase_layers.js';
import {
  createAssetDropdownWithNone,
  createDropdown,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData,
  SameDisasterChecker, verifyAsset
} from './manage_disaster_base.js';

export {onSetFlexibleDisaster, initializeFlexible};

function initializeFlexible() {
  // Set up radio buttons for flexible buildings source.
  const buildingSourceBuildings = $('#building-source-buildings-div');
  const buildingSourcePoverty = $('#building-source-poverty-div');
  const useDamageForBuildingsPath = ['useDamageForBuildings'];
  $('#building-source-damage').on('click', () => {
    buildingSourceBuildings.hide();
    buildingSourcePoverty.hide();
    handleAssetDataChange(true, useDamageForBuildingsPath);
  });
  $('#building-source-buildings').on('click', () => {
    buildingSourceBuildings.show();
    buildingSourcePoverty.hide();
    handleAssetDataChange(false, useDamageForBuildingsPath);
  });
  $('#building-source-poverty').on('click', () => {
    buildingSourceBuildings.hide();
    buildingSourcePoverty.show();
    handleAssetDataChange(false, useDamageForBuildingsPath);
  });
}

const sameDisasterChecker = new SameDisasterChecker();

async function onSetFlexibleDisaster(assetData) {
  const currentDisaster = getDisaster();
  sameDisasterChecker.reset();
  $('#state-based-disaster-asset-selection-table').hide();
  const flexibleDataDiv = $('#flexible-data');
  flexibleDataDiv.show();
  initializeScoreBoundsMapFromAssetData(assetData);
  const povertyDiv = $('#flexible-poverty-asset-data');
  povertyDiv.empty().show();
  povertyDiv.append($(document.createElement('span')).text('Poverty asset path: '));
  const pendingSelect = createPendingSelect();
  povertyDiv.append(pendingSelect);
  // Same promise as waited on above in onSetDisaster, so actually both will
  // complete before user switches disasters or neither will, but we can still
  // check in each independently.
  const disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  if (!sameDisasterChecker.markDoneIfStillValid()) {
    // Don't do anything unless this is still the right disaster.
    return;
  }
  // Don't disable any feature collections.
  for (const attributes of disasterAssets.values()) {
    attributes.disabled = attributes.type !== LayerType.FEATURE_COLLECTION;
  }
  const povertyId = 'select-flexible-poverty';
  const povertySelect = createAssetDropdownWithNone(disasterAssets, ['flexibleData', 'povertyPath'])
      .prop('id', povertyId)
      .on('change', async () => {
        const assetName = povertySelect.val();
        const attributes = disasterAssets.get(assetName);
        const propertyNames = await verifyAsset(povertyId, null);
        if (!propertyNames) {
          return;
        }
        povertyPropertiesProcessor(propertyNames, povertySelect, povertyDiv, assetName);
        if (!attributes.hasGeometry) {

        }
      });
  pendingSelect.remove();
  povertyDiv.append(povertySelect);
}

function povertyPropertiesProcessor(properties, povertySelect, povertyDiv, assetName) {
  if (povertySelect.val() !== assetName) {
    // If we've switched assets, do nothing.
    return;
  }
  properties = properties.filter(isUserProperty);

  // TODO(janakdr): Do async add_layer processing so we can warn if column not
  //  ok for whatever user wants it for?
  const enabledProperties = properties.map((p) => [p, {disabled: false}]);
  povertyDiv.append($(document.createElement('span')).text('Poverty rate column: '));
  povertyDiv.append(createColumnDropdown(enabledProperties, ['flexibleData', 'povertyRateKey']));
  povertyDiv.append($(document.createElement('span')).text('District description column (human-readable description of each region): '));
  povertyDiv.append(createColumnDropdown(enabledProperties, ['flexibleData', 'districtDescriptionKey']));
  povertyDiv.append($(document.createElement('span')).text('District identifier column (typically numeric/short string): '));
  povertyDiv.append(createColumnDropdown(enabledProperties, ['flexibleData',
    'povertyGeoid']));
  $('#buildings-poverty-select-span').empty().append(createColumnDropdown(enabledProperties, ['flexibleData', 'buildingKey']));
}

function createColumnDropdown(properties, path) {
  const select = createDropdown(properties, path);
  return select.on('change', () => handleAssetDataChange(select.val(), path));
}
