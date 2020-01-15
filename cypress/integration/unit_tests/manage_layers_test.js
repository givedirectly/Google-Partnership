import {eeLegacyPathPrefix} from '../../../docs/ee_paths.js';
import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {withColor} from '../../../docs/import/color_function_util.js';
import {createOptionFrom, createTd, getAssetsAndPopulateDisasterPicker, onCheck, onDelete, onInputBlur, onListBlur, updateAfterSort, withCheckbox, withInput, withList, withType} from '../../../docs/import/manage_layers.js';
import {setCurrentDisaster} from '../../../docs/import/manage_layers_lib';
import {disasterData, getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import {getDisaster} from '../../../docs/resources';
import {getConvertEeObjectToPromiseRelease} from '../../support/import_test_util';
import {createAndAppend, createTrs, setDisasterAndLayers, setUpSavingStubs, waitForPromiseAndAssertSaves} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

describe('Unit tests for manage_layers page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  before(() => {
    const disasterPicker = createAndAppend('select', 'disaster');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');

    createAndAppend('div', 'status').hide();
  });

  setUpSavingStubs();
  let listAssetsStub;
  beforeEach(() => {
    listAssetsStub = cy.stub(ee.data, 'listAssets');
    cy.stub(ee.data, 'createFolder');

    // In prod this would happen in enableWhenReady which would read from
    // firestore.
    disasterData.clear();
    disasterData.set('2001-summer', {});
    disasterData.set('2003-spring', {});
  });

  it('filters out a null geometry disaster folder asset', () => {
    const disaster = getDisaster();
    listAssetsStub
        .withArgs(
            eeLegacyPathPrefix + disaster, Cypress.sinon.match.any,
            Cypress.sinon.match.func)
        .returns(Promise.resolve({
          'assets': [
            {id: 'asset/with/geometry', type: 'TABLE'},
            {id: 'asset/with/null/geometry', type: 'TABLE'},
            {id: 'asset/with/empty/geometry', type: 'TABLE'},
          ],
        }));
    const withGeometry =
        ee.FeatureCollection([ee.Feature(ee.Geometry.Point([1, 1]), {})]);
    const withNullGeometry = ee.FeatureCollection([ee.Feature(null, {})]);
    const withEmptyGeometry =
        ee.FeatureCollection([ee.Feature(ee.Geometry.MultiPoint([]), {})]);
    const featureCollectionStub = cy.stub(ee, 'FeatureCollection');
    featureCollectionStub.withArgs('asset/with/geometry').returns(withGeometry);
    featureCollectionStub.withArgs('asset/with/null/geometry')
        .returns(withNullGeometry);
    featureCollectionStub.withArgs('asset/with/empty/geometry')
        .returns(withEmptyGeometry);
    cy.document().then((doc) => {
      const damageDiv = document.createElement('div');
      damageDiv.id = 'disaster-asset-picker';
      doc.body.appendChild(damageDiv);
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
    });
    cy.wrap(getAssetsAndPopulateDisasterPicker(disaster));
    cy.get('[id="asset/with/geometry"]').should('not.be.disabled');
    cy.get('[id="asset/with/null/geometry"]').should('be.disabled');
    cy.get('[id="asset/with/empty/geometry"]').should('be.disabled');
  });

  it('has racing disaster asset populates', () => {
    const disaster = 'disaster';
    const otherDisaster = 'other';
    const fc =
        ee.FeatureCollection([ee.Feature(ee.Geometry.Point([1, 1]), {})]);
    cy.stub(ee, 'FeatureCollection').returns(fc);
    listAssetsStub.returns(
        Promise.resolve({'assets': [{id: disaster, type: 'TABLE'}]}));

    let firstStartPromise;
    let firstConvertRelease;
    let finishedDisaster;
    cy.document().then((doc) => {
      const damageDiv = document.createElement('div');
      damageDiv.id = 'disaster-asset-picker';
      doc.body.appendChild(damageDiv);
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      // set disaster to 'disaster'
      const firstConvert = getConvertEeObjectToPromiseRelease();
      firstStartPromise = firstConvert.startPromise;
      firstConvertRelease = firstConvert.releaseLatch;
      setCurrentDisaster(disaster);
      finishedDisaster = getAssetsAndPopulateDisasterPicker(disaster);
    });
    let secondConvertRelease;
    let finishedOther;
    cy.get('#disaster-adder-label')
        .find('select')
        .should('be.disabled')
        // wait for us to hit 'disaster' call to convertEeObjectToPromise
        .then(() => firstStartPromise)
        .then(() => {
          // set disaster to 'other'
          secondConvertRelease =
              getConvertEeObjectToPromiseRelease().releaseLatch;
          setCurrentDisaster(otherDisaster);
          finishedOther = getAssetsAndPopulateDisasterPicker(otherDisaster);
        });
    cy.get('#other-adder-label').find('select').should('be.disabled');
    cy.get('#disaster-adder-label').should('not.exist').then(() => {
      // release result of 'disaster' call to convertEeObjectToPromise
      firstConvertRelease();
      return finishedDisaster;
    });
    // assert nothing changed even after waiting on 'disaster' call is entirely
    // finished since we already kicked off 'other' call.
    cy.get('#other-adder-label').find('select').should('be.disabled');
    cy.get('#disaster-adder-label').should('not.exist').then(() => {
      // release result of 'other' call to convertEeObjectToPromise
      secondConvertRelease();
      // wait on picker to be finished populating
      return finishedOther;
    });
    cy.get('#other-adder-label').find('select').should('not.be.disabled');
    cy.get('#disaster-adder-label').should('not.exist');
  });

  it('tests color cell', () => {
    const property = 'color';

    const noColor = withColor(createTd(), {}, property, 0);
    expect(noColor.text()).to.equal('N/A');
    expect(noColor.hasClass('na')).to.be.true;

    const yellow = 'rgb(255, 255, 0)';
    const singleColor = withColor(
        createTd(), {color: {'currentStyle': 2, 'color': yellow}}, property, 0);
    expect(singleColor.children('.box').length).to.equal(1);
    expect(singleColor.children().eq(0).css('background-color'))
        .to.equal(yellow);

    const baseColor = withColor(
        createTd(), {color: {'currentStyle': 0, 'color': yellow}}, property, 0);
    expect(baseColor.children('.box').length).to.equal(1);
    expect(baseColor.children().eq(0).css('background-color')).to.equal(yellow);

    const red = 'rgb(255, 0, 0)';
    const discrete = withColor(
        createTd(), {
          color: {
            'currentStyle': 1,
            'colors': {'squash': yellow, 'tomato': red, 'pepper': red},
          },
        },
        property, 0);
    expect(discrete.children('.box').length).to.equal(2);
    expect(discrete.children().eq(1).css('background-color')).to.equal(red);

    const broken =
        withColor(createTd(), {color: {'broken': 'colors'}}, property, 3);
    expect(broken.children().length).to.equal(0);
    expect(broken.text()).to.be.empty;
    const status = $('#status');
    expect(status.is(':visible')).to.be.true;
    expect(status.text()).to.contain('unrecognized color function');
  });

  it('tests type cell', () => {
    const two = withType(createTd(), {type: 2}, 'type');
    expect(two.text()).to.equal('IMAGE');
  });

  it('tests list cell', () => {
    const chocolate = 'chocolate';
    const chai = 'chai';
    const nutmeg = 'nutmeg';
    const layer = {flavors: [chocolate, chai]};

    setDisasterAndLayers([layer]);

    const property = 'flavors';
    const flavors = withList(createTd(), layer, 'flavors');
    const list = flavors.children('textarea');
    expect(list.val()).to.equal(chocolate + '\n' + chai);

    list.val(chai + '\n' + nutmeg + '\n with spaces \n  \n');
    testSave(onListBlur, property, list, [chai, nutmeg, 'with spaces']);
  });

  it('tests input cell', () => {
    const chocolate = 'chocolate';
    const chai = 'chai';
    const layer = {flavor: chocolate};

    setDisasterAndLayers([layer]);

    const property = 'flavor';
    const td = withInput(createTd(), layer, property);
    const input = td.children('input');
    expect(input.val()).to.equal(chocolate);

    input.val(chai);
    testSave(onInputBlur, property, input, chai);
  });

  /**
   * Checks if a checkbox has been checked or unchecked based on param.
   * @param {boolean} checks
   */
  function checkboxTest(checks) {
    const layer = {displayOnLoad: !checks};
    setDisasterAndLayers([layer]);

    const property = 'displayOnLoad';
    const unchecked = withCheckbox(createTd(), layer, property);
    const checkbox = unchecked.children().first();
    expect(checkbox.prop('checked')).to.eq(!checks);

    checkbox.prop('checked', checks);
    testSave(onCheck, property, checkbox, checks);
  }

  it('tests checkbox cell check', () => checkboxTest(true));
  it('tests checkbox cell uncheck', () => checkboxTest(false));

  it('deletes a layer', () => {
    setDisasterAndLayers([{layer: 0}, {layer: 1}]);
    const tbody = createAndAppend('tbody', 'tbody');
    const rows = createTrs(2);
    tbody.append(rows);
    const colorEditor = createAndAppend('div', 'color-fxn-editor').show();

    cy.stub(window, 'confirm').returns(true);
    waitForPromiseAndAssertSaves(onDelete(rows[0])).then(() => {
      expect(colorEditor.is(':visible')).to.be.false;
      expect(tbody.children('tr').length).to.equal(1);
      // ensure reindex
      expect(tbody.children('tr').children('.index-td').text()).to.equal('0');
      expect(getCurrentLayers().length).to.equal(1);
      // ensure right layer was deleted
      expect(getCurrentLayers()[0]['layer']).to.equal(1);
    });
  });

  it('checks data updates after a sort', () => {
    setDisasterAndLayers(
        [{initialIndex: 0}, {initialIndex: 1}, {initialIndex: 2}]);

    const tbody = createAndAppend('tbody', 'tbody');
    const rows = createTrs(3);
    tbody.append(rows);

    // as if we had just dragged 0 index to 2 spot.
    rows[0].children('td').first().text(0);
    rows[1].children('td').first().text(2);
    rows[2].children('td').first().text(1);

    waitForPromiseAndAssertSaves(updateAfterSort({item: rows[0]}))
        .then(() => {
          const postSortLayers = getCurrentLayers();
          expect(postSortLayers[0]['initialIndex']).equals(1);
          expect(postSortLayers[1]['initialIndex']).equals(2);
          expect(postSortLayers[2]['initialIndex']).equals(0);

          expect(rows[0].text()).equals('2');
          expect(rows[1].text()).equals('1');
          expect(rows[2].text()).equals('0');

          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(getDisaster())
              .get();
        })
        .then((doc) => {
          const layers = doc.data().layerArray;
          expect(layers[0]['initialIndex']).to.equal(1);
          expect(layers[1]['initialIndex']).to.equal(2);
          expect(layers[2]['initialIndex']).to.equal(0);
        });
  });
});

/**
 * Function that tests the save method works.
 * @param {Function} fxn save function
 * @param {string} property
 * @param {Object} input DOM object from which to pull new value
 * @param {*} afterVal
 */
function testSave(fxn, property, input, afterVal) {
  const row = createTrs(1);
  createAndAppend('tbody', 'tbody').append(row);
  row[0].append(input);

  waitForPromiseAndAssertSaves(fxn({target: input}, property))
      .then(() => {
        expect(getCurrentLayers()[0][property]).to.eql(afterVal);
        return getFirestoreRoot()
            .collection('disaster-metadata')
            .doc(getDisaster())
            .get();
      })
      .then(
          (doc) =>
              expect(doc.data()['layerArray'][0][property]).to.eql(afterVal));
}
