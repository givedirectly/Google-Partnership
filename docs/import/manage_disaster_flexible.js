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
  const povertyId = 'select-flexible-poverty';
  const povertyPath = ['flexibleData', 'povertyPath'];
  const povertySelect = createAssetDropdownWithNone(allEnabledDisasterAssets, povertyPath)
      .prop('id', povertyId)
      .on('change', async () => {
        const samePovertyChecker = new SameSelectChecker(povertySelect);
        const assetName = samePovertyChecker.val();
        const attributes = disasterAssets.get(assetName);
        const propertyNames = await onNonDamageAssetSelect(povertyPath, null, povertyId);
        if (!propertyNames) {
          return;
        }
        if (!samePovertyChecker.markDoneIfStillValid()) {
          // If we've switched assets, do nothing.
          return;
        }
        povertyPropertiesProcessor(propertyNames, povertySelect, povertyDiv, assetName);
        const geographyDiv = $('#flexible-geography-asset-data');
        if (attributes.hasGeometry) {
          const geographyPath = ['flexibleData', 'geographyPath'];
          handleAssetDataChange(null, geographyPath);
          geographyDiv.hide();
        } else {
          const geographyId = 'select-flexible-geography';

          const geographySelect = createAssetDropdownWithNone(disasterAssets, geographyPath)
              .prop('id', geographyId)
              .on('change', async () => {
                const sameGeographyChecker = new SameSelectChecker(geographySelect);
                const propertyNames = await onNonDamageAssetSelect(povertyPath, null, povertyId);
                if (!propertyNames) {
                  return;
                }
                const geographyAttrList = $(document.createElement('ul'));
                geographyAttrList.app
              })
        }
      });
  pendingSelect.remove();
  povertyDiv.append(povertySelect);
}

function povertyPropertiesProcessor(properties, povertySelect, povertyDiv) {
  properties = properties.filter(isUserProperty);

  // TODO(janakdr): Do async add_layer processing so we can warn if column not
  //  ok for whatever user wants it for?
  const enabledProperties = properties.map((p) => [p, {disabled: false}]);
  const povertyAttrList = $(document.createElement('ul'));
  povertyAttrList.append($(document.createElement('li')).append('Poverty rate column: ').append(createColumnDropdown(enabledProperties, ['flexibleData', 'povertyRateKey'])));
  povertyAttrList.append($(document.createElement('li')).append('District description column (human-readable description of each region): ').append(createColumnDropdown(enabledProperties, ['flexibleData', 'districtDescriptionKey'])));
  povertyAttrList.append($(document.createElement('li')).append('District identifier column (typically numeric/short string): ').append(createColumnDropdown(enabledProperties, ['flexibleData',
    'povertyGeoid'])));
  povertyDiv.append(povertyAttrList);
  $('#buildings-poverty-select-span').empty().append(createColumnDropdown(enabledProperties, ['flexibleData', 'buildingKey']));
}

function createColumnDropdown(properties, path) {
  const select = createAssetDropdownWithNone(properties, path);
  return select.on('change', () => handleAssetDataChange(select.val(), path));
}
