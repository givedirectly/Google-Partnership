import * as manageDisasterBase from '../../../docs/import/manage_disaster_base.js';
import * // we need this alias due to the way functions are exported.
    as manageDisasterBaseModule from '../../../docs/import/manage_disaster_base.js';
import * as addLayer from '../../../docs/import/add_layer.js';
import * as manageCommon from '../../../docs/import/manage_common.js';
import * as resources from '../../../docs/resources.js';

// Basic HTML structure needed for the tests
const testFixture = `
  <div id="damage-asset-div">
    <span id="damage-intro-span">Damage Asset</span>
    <select id="id-from-path-damageAssetPath"></select>
    <ul id="damage-attrs-ul-id">
      <li>
        <span id="explanation-span-id-from-path-noDamageKey">
          No damage column (optional explanation): 
        </span>
        <select id="id-from-path-noDamageKey"></select>
      </li>
      <li>
        <span id="explanation-span-id-from-path-noDamageValue">
          No damage value (optional explanation): 
        </span>
        <input type="text" id="id-from-path-noDamageValue">
        <!-- Select will be added here by the function -->
      </li>
    </ul>
  </div>
  <div id="map-bounds-div" style="display: none;">Map Bounds Div</div>
`;

describe('Manage Disaster Base - No Damage Value Logic', () => {
  let disasterDataStub;

  beforeEach(()
               -> {
                 // Append the fixture to the test runner's document
                 document.body.innerHTML = testFixture;

                 // Common stubs
                 cy.stub(manageDisasterBaseModule, 'getStoredValueFromPath')
                     .callsFake((path) => {
                       if (path.join('-') ===
                           manageDisasterBase.NODAMAGE_COLUMN_INFO.path.join(
                               '-')) {
                         return $('#id-from-path-noDamageKey').val();
                       }
                       if (path.join('-') ===
                           manageDisasterBase.NODAMAGE_VALUE_INFO.path.join(
                               '-')) {
                         // This needs to be more sophisticated if we test actual saving
                         // For now, assume it reflects current input/select for simplicity in some tests
                         const select = $(
                             '#id-from-path-noDamageValue-select');
                         if (select.is(':visible')) return select.val();
                         return $('#id-from-path-noDamageValue').val();
                       }
                       if (path.join('-') ===
                           manageDisasterBase.DAMAGE_PROPERTY_PATH.join(
                               '-')) {
                         return $('#id-from-path-damageAssetPath').val();
                       }
                       return null;
                     });

                 cy.stub(manageDisasterBaseModule, 'getPageValueOfPath')
                     .callsFake((path) => {
                       if (path.join('-') ===
                           manageDisasterBase.DAMAGE_PROPERTY_PATH.join(
                               '-')) {
                         return $('#id-from-path-damageAssetPath').val();
                       }
                       if (path.join('-') ===
                           manageDisasterBase.NODAMAGE_COLUMN_INFO.path.join(
                               '-')) {
                         return $('#id-from-path-noDamageKey').val();
                       }
                       // Add more if other paths are read by page value
                       return null;
                     });

                 cy.stub(manageDisasterBaseModule, 'isFlexible').returns(true);
                 cy.stub(manageDisasterBaseModule, 'useDamageForBuildings')
                     .returns(false); // Default to not requiring damage for buildings

                 cy.stub(manageCommon, 'createOptionFrom')
                     .callsFake((text) => {
                       const val = (typeof text === 'string' || typeof text === 'number') ? text : (text.value || text.name);
                       return $('<option>').text(text.name || text).val(val);
                     });
                 
                 cy.stub(manageDisasterBaseModule, 'handleAssetDataChange')
                     .as('handleAssetDataChangeStub')
                     .resolves();
                 
                 cy.stub(manageDisasterBaseModule, 'setOptionsForSelect', (options, propertyPath) => {
                    const select = manageDisasterBaseModule.getInputElementFromPath(propertyPath);
                    select.empty().append(manageCommon.createOptionFrom('None').val(''));
                    options.forEach(op => select.append(manageCommon.createOptionFrom(op)));
                    return select;
                 }).as('setOptionsForSelectStub');


                 // Stub for disasterData
                 // Functions that use disasterData (like getStoredValueFromPath, isFlexible) are stubbed directly
                 // to avoid complex mocking of the disasterData map itself.
                 cy.stub(resources, 'getDisaster').returns('current_disaster');
                 // Default stub for getStoredValueFromPath for DAMAGE_PROPERTY_PATH
                 manageDisasterBaseModule.getStoredValueFromPath
                    .withArgs(manageDisasterBase.DAMAGE_PROPERTY_PATH)
                    .returns($('#id-from-path-damageAssetPath').val());


                 // Stub for getExemplars
                 cy.stub(addLayer, 'getExemplars')
                     .as('getExemplarsStub')
                     .resolves([]); // Default to >25 values

                 // Ensure the elements exist before trying to interact
                 expect($('#id-from-path-damageAssetPath')).to.exist;
                 expect($('#id-from-path-noDamageKey')).to.exist;
                 expect($('#id-from-path-noDamageValue')).to.exist;
               });

  afterEach(() => {
    // Clean up the fixture
    document.body.innerHTML = '';
  });

  describe('Dropdown Display (<= 25 unique values)', () => {
    it('should display a select dropdown and hide input', async () => {
      const uniqueValues = ['val1', 'val2', 'val3', 'val4', 'val5'];
      addLayer.getExemplars.resolves(uniqueValues); // Mock for 5 values

      // Set a damage asset and a no-damage column
      $('#id-from-path-damageAssetPath').val('projects/test-project/assets/damageAsset');
      $('#id-from-path-noDamageKey').val('no_damage_prop');
      manageDisasterBaseModule.getStoredValueFromPath
        .withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('no_damage_prop');

      
      // Simulate that a column is selected, and propertyValues are ready
      const propertyValues = new Map();
      propertyValues.set('no_damage_prop', Promise.resolve(uniqueValues));

      await manageDisasterBase.maybeShowNoDamageValueItem(
          'projects/test-project/assets/damageAsset', propertyValues);

      cy.get('#id-from-path-noDamageValue-select')
          .should('be.visible')
          .and(($select) => {
            expect($select.find('option').length)
                .to.equal(uniqueValues.length + 1); // +1 for "Select a value"
            uniqueValues.forEach((val) => {
              expect($select.find(`option[value="${val}"]`)).to.exist;
            });
          });
      cy.get('#id-from-path-noDamageValue').should('not.be.visible');
    });
  });

  describe('Input Field Display (> 25 unique values)', () => {
    it('should display a text input and no select dropdown', async () => {
      addLayer.getExemplars.resolves([]); // Mock for >25 values (empty array)

      $('#id-from-path-damageAssetPath').val('projects/test-project/assets/damageAsset');
      $('#id-from-path-noDamageKey').val('no_damage_prop');
      manageDisasterBaseModule.getStoredValueFromPath
        .withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('no_damage_prop');

      const propertyValues = new Map();
      propertyValues.set('no_damage_prop', Promise.resolve([])); // empty array means >25 or 0

      await manageDisasterBase.maybeShowNoDamageValueItem(
          'projects/test-project/assets/damageAsset', propertyValues);

      cy.get('#id-from-path-noDamageValue').should('be.visible');
      cy.get('#id-from-path-noDamageValue-select').should('not.exist');
    });
  });

  describe('Saving Dropdown Value', () => {
    it('should call handleAssetDataChange with selected value', async () => {
      const uniqueValues = ['no_damage', 'slight_damage'];
      addLayer.getExemplars.resolves(uniqueValues);
      manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns(null);


      $('#id-from-path-damageAssetPath').val('projects/test-project/assets/damageAsset');
      $('#id-from-path-noDamageKey').val('damage_code');
      
      const propertyValues = new Map();
      propertyValues.set('damage_code', Promise.resolve(uniqueValues));

      await manageDisasterBase.maybeShowNoDamageValueItem(
          'projects/test-project/assets/damageAsset', propertyValues);
      
      cy.get('#id-from-path-noDamageValue-select').should('be.visible');
      cy.get('#id-from-path-noDamageValue-select').select('no_damage');
      // Trigger change manually for non-interactive select
      $('#id-from-path-noDamageValue-select').trigger('change'); 

      cy.get('@handleAssetDataChangeStub')
          .should('have.been.calledWith', 'no_damage', manageDisasterBase.NODAMAGE_VALUE_INFO.path);
    });
  });

  describe('Saving Input Field Value', () => {
    it('should call handleAssetDataChange on blur after being set up', async () => {
      // First, call createNoDamageColumnAndValueList to set up the event listener
      // This requires NODAMAGE_VALUE_INFO.path and NODAMAGE_COLUMN_INFO.path to be stubbed for getStoredValueFromPath
      // and also that their respective input/select elements exist.
      manageDisasterBaseModule.getStoredValueFromPath
          .withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns(''); // Initially empty
      manageDisasterBaseModule.getStoredValueFromPath
          .withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns(''); // Initially no column selected

      // We also need to mock the functions called by createNoDamageColumnAndValueList if they're complex
      // For example, createSelectListItemFromColumnInfo, createListItem
      // For simplicity, let's assume these helpers correctly create the elements.
      // The critical part is that the input field gets its blur listener.
      // Let's ensure the input element is in the DOM as expected by createNoDamageColumnAndValueList
      expect($('#id-from-path-noDamageValue')).to.exist;

      manageDisasterBase.createNoDamageColumnAndValueList();
      // Now the blur event should be attached to #id-from-path-noDamageValue

      addLayer.getExemplars.resolves([]); // >25 values, so input field stays visible

      $('#id-from-path-damageAssetPath').val('projects/test-project/assets/damageAsset');
      $('#id-from-path-noDamageKey').val('damage_intensity');
      manageDisasterBaseModule.getStoredValueFromPath
        .withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('damage_intensity');

      const propertyValues = new Map();
      propertyValues.set('damage_intensity', Promise.resolve([]));

      // Ensure maybeShowNoDamageValueItem shows the input field as expected
      await manageDisasterBase.maybeShowNoDamageValueItem(
          'projects/test-project/assets/damageAsset', propertyValues);
      
      cy.get('#id-from-path-noDamageValue').should('be.visible');
      
      // Type into the input and trigger blur
      // Stub getStoredValueFromPath to reflect the typed value for the handler
      const typedValue = '0.0';
      $('#id-from-path-noDamageValue').val(typedValue); // Simulate typing
      manageDisasterBaseModule.getStoredValueFromPath
          .withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns(typedValue);
      
      $('#id-from-path-noDamageValue').trigger('blur');

      cy.get('@handleAssetDataChangeStub')
          .should('have.been.calledWith', typedValue, manageDisasterBase.NODAMAGE_VALUE_INFO.path);
    });
  });
  
  describe('Clearing Value on Damage Asset Change', () => {
    // Helper function to simulate the sequence of events when damage asset changes
    async function simulateDamageAssetChange(newDamageAsset, newPropertyNamesPromise = Promise.resolve(null)) {
        // Mimic displayDamageRelatedElements sequence
        manageDisasterBase.handleAssetDataChange(null, manageDisasterBase.NODAMAGE_VALUE_INFO.path);
        
        // This part mimics setNoDamageColumnAndValue being called with nulls first, then potentially real values
        // For clearing, the crucial call is with null propertyValues
        await manageDisasterBase.setNoDamageColumnAndValue(newDamageAsset, null, null);
    }

    context('when useDamageForBuildings is false (default)', () => {
        beforeEach(() => {
            manageDisasterBaseModule.useDamageForBuildings.returns(false);
        });

        it('Scenario A (Dropdown to Input/Hidden): Dropdown was visible, noDamageKey STAYS, asset clears', async () => {
            const uniqueValues = ['val1', 'val2'];
            addLayer.getExemplars.resolves(uniqueValues);
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('no_damage_prop');
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns('val1');

            $('#id-from-path-damageAssetPath').val('asset1');
            $('#id-from-path-noDamageKey').val('no_damage_prop');
            
            let propertyValues = new Map();
            propertyValues.set('no_damage_prop', Promise.resolve(uniqueValues));

            await manageDisasterBase.maybeShowNoDamageValueItem('asset1', propertyValues);
            cy.get('#id-from-path-noDamageValue-select').should('be.visible').select('val1').trigger('change');
            cy.get('@handleAssetDataChangeStub').should('have.been.calledWith', 'val1', manageDisasterBase.NODAMAGE_VALUE_INFO.path);

            await simulateDamageAssetChange(null); // Damage asset cleared

            cy.get('@handleAssetDataChangeStub').should('have.been.calledWith', null, manageDisasterBase.NODAMAGE_VALUE_INFO.path);
            cy.get('#id-from-path-noDamageValue-select').should('not.exist');
            // noDamageKey is still 'no_damage_prop', so showInputInitially = true for the item
            cy.get('#id-from-path-noDamageValue').should('be.visible').and('have.value', '');
            cy.get('#id-from-path-noDamageValue').parent().should('be.visible');
        });

        it('Scenario A.2 (Dropdown to Hidden): Dropdown was visible, noDamageKey CLEARS, asset clears', async () => {
            const uniqueValues = ['val1', 'val2'];
            addLayer.getExemplars.resolves(uniqueValues);
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('no_damage_prop'); // Initially
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns('val1');

            $('#id-from-path-damageAssetPath').val('asset1');
            $('#id-from-path-noDamageKey').val('no_damage_prop');
            
            let propertyValues = new Map();
            propertyValues.set('no_damage_prop', Promise.resolve(uniqueValues));

            await manageDisasterBase.maybeShowNoDamageValueItem('asset1', propertyValues);
            cy.get('#id-from-path-noDamageValue-select').should('be.visible');

            // Simulate noDamageKey also being cleared (e.g., user selects "None")
            $('#id-from-path-noDamageKey').val('');
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns(''); // Now it's cleared

            await simulateDamageAssetChange(null); 

            cy.get('@handleAssetDataChangeStub').should('have.been.calledWith', null, manageDisasterBase.NODAMAGE_VALUE_INFO.path);
            cy.get('#id-from-path-noDamageValue-select').should('not.exist');
            // noDamageKey is now empty, so showInputInitially = false for the item
            cy.get('#id-from-path-noDamageValue').parent().should('not.be.visible');
        });


        it('Scenario B (Input to Input/Hidden): Input field was visible, noDamageKey STAYS, asset clears', async () => {
            addLayer.getExemplars.resolves([]); // >25 values
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('no_damage_prop');
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns('some_value');

            $('#id-from-path-damageAssetPath').val('asset1');
            $('#id-from-path-noDamageKey').val('no_damage_prop');
            $('#id-from-path-noDamageValue').val('some_value');

            let propertyValues = new Map();
            propertyValues.set('no_damage_prop', Promise.resolve([]));

            await manageDisasterBase.maybeShowNoDamageValueItem('asset1', propertyValues);
            cy.get('#id-from-path-noDamageValue').should('be.visible').and('have.value', 'some_value');

            await simulateDamageAssetChange(null);

            cy.get('@handleAssetDataChangeStub').should('have.been.calledWith', null, manageDisasterBase.NODAMAGE_VALUE_INFO.path);
            cy.get('#id-from-path-noDamageValue-select').should('not.exist');
            cy.get('#id-from-path-noDamageValue').should('be.visible').and('have.value', '');
            cy.get('#id-from-path-noDamageValue').parent().should('be.visible');
        });
    });

    context('when useDamageForBuildings is true', () => {
        beforeEach(() => {
            manageDisasterBaseModule.useDamageForBuildings.returns(true);
        });

        it('Item remains visible if noDamageKey is set, even if asset cleared', async () => {
            // This tests that showInputInitially remains true due to useDamageForBuildings = true
            // and a stored noDamageKey, even if the damage asset is cleared.
            addLayer.getExemplars.resolves([]); 
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_COLUMN_INFO.path).returns('no_damage_prop'); // Stored/selected column
            manageDisasterBaseModule.getStoredValueFromPath.withArgs(manageDisasterBase.NODAMAGE_VALUE_INFO.path).returns('some_text_value');

            $('#id-from-path-damageAssetPath').val('asset1');
            $('#id-from-path-noDamageKey').val('no_damage_prop'); // UI reflects stored column
            $('#id-from-path-noDamageValue').val('some_text_value');
            
            let propertyValues = new Map();
            propertyValues.set('no_damage_prop', Promise.resolve([]));

            await manageDisasterBase.maybeShowNoDamageValueItem('asset1', propertyValues);
            cy.get('#id-from-path-noDamageValue').parent().should('be.visible');
            cy.get('#id-from-path-noDamageValue').should('be.visible').and('have.value', 'some_text_value');
            
            await simulateDamageAssetChange(null); // Clear damage asset

            cy.get('@handleAssetDataChangeStub').should('have.been.calledWith', null, manageDisasterBase.NODAMAGE_VALUE_INFO.path);
            // Even with asset cleared, because useDamageForBuildings=true and a noDamageKey is "stored",
            // the item should be visible, expecting input.
            cy.get('#id-from-path-noDamageValue-select').should('not.exist');
            cy.get('#id-from-path-noDamageValue').should('be.visible').and('have.value', ''); // Value cleared
            cy.get('#id-from-path-noDamageValue').parent().should('be.visible');
        });
    });
  });
});
