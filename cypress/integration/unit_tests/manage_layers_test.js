import {gdEeStatePrefix, legacyStateDir, legacyStatePrefix} from '../../../docs/ee_paths.js';
import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {withColor} from '../../../docs/import/color_function_util.js';
import {getStatesAssetsFromEe} from '../../../docs/import/list_ee_assets.js';
import {createOptionFrom, createStateAssetPickers, createTd, onCheck, onDelete, onInputBlur, onListBlur, stateAssets, updateAfterSort, withCheckbox, withInput, withList, withType} from '../../../docs/import/manage_layers.js';
import {disasterData, getCurrentLayers} from '../../../docs/import/manage_layers_lib.js';
import {getDisaster} from '../../../docs/resources';
import * as Snackbar from '../../../docs/snackbar.js';
import {createAndAppend, createTrs, setDisasterAndLayers} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const KNOWN_STATE = 'WF';
const UNKNOWN_STATE = 'DN';
const KNOWN_STATE_ASSET = gdEeStatePrefix + KNOWN_STATE + '/snap';

describe('Unit tests for manage_layers page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  before(() => {
    const disasterPicker = createAndAppend('select', 'disaster');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');

    createAndAppend('div', 'status').hide();
  });

  let savingStub;
  let savedStub;
  beforeEach(() => {
    const listAssetsStub = cy.stub(ee.data, 'listAssets');
    listAssetsStub.withArgs(legacyStateDir, {}, Cypress.sinon.match.func)
        .returns(Promise.resolve({
          'assets': [{
            id: gdEeStatePrefix + KNOWN_STATE,
          }],
        }));
    listAssetsStub
        .withArgs(legacyStatePrefix + KNOWN_STATE, {}, Cypress.sinon.match.func)
        .returns(Promise.resolve({
          'assets': [
            {
              id: gdEeStatePrefix + KNOWN_STATE + '/snap',
              type: 'TABLE',
            },
            {
              id: gdEeStatePrefix + KNOWN_STATE + '/folder',
              type: 'FOLDER',
            },
          ],
        }));
    cy.stub(ee.data, 'createFolder');
    const snackbarStub = cy.stub(Snackbar, 'showSnackbarMessage');
    savingStub = snackbarStub.withArgs('Saving...', -1);
    savedStub = snackbarStub.withArgs('Saved');

    stateAssets.clear();
    // In prod this would happen in enableWhenReady which would read from
    // firestore.
    disasterData.clear();
    disasterData.set('2001-summer', {});
    disasterData.set('2003-spring', {});
  });

  afterEach(() => {
    stateAssets.clear();
    disasterData.clear();
  });

  it('gets state asset info from ee', () => {
    cy.wrap(getStatesAssetsFromEe([KNOWN_STATE])).then((assets) => {
      // tests folder type asset doesn't make it through
      expect(assets[0]).to.eql(
          [KNOWN_STATE, new Map([[KNOWN_STATE_ASSET, 'TABLE']])]);
      expect(ee.data.listAssets)
          .to.be.calledWith(
              legacyStatePrefix + KNOWN_STATE, {}, Cypress.sinon.match.func);
    });
  });

  it('populates state asset pickers', () => {
    const assetPickers = createAndAppend('div', 'state-asset-pickers');
    const assets = [KNOWN_STATE, UNKNOWN_STATE];
    stateAssets.set(KNOWN_STATE, new Map([[KNOWN_STATE_ASSET, 'TABLE']]));
    stateAssets.set(UNKNOWN_STATE, new Map());
    createStateAssetPickers(assets);

    // 2 x <label> (w/ select nested inside) <br>
    expect(assetPickers.children().length).to.equal(4);
    const known = $('#' + KNOWN_STATE + '-adder');
    expect(known).to.contain(gdEeStatePrefix + KNOWN_STATE + '/snap');
    expect(known.children().length).to.equal(1);
    expect($('#' + UNKNOWN_STATE + '-adder').children().length).to.equal(0);
  });

  it('tests color cell', () => {
    const property = 'color';

    const noColor = withColor(createTd(), {}, property, 0);
    expect(noColor.text()).to.equal('N/A');
    expect(noColor.hasClass('na')).to.be.true;

    const yellow = 'yellow';
    const singleColor = withColor(
        createTd(), {color: {'current-style': 2, 'color': yellow}}, property,
        0);
    expect(singleColor.children('.box').length).to.equal(1);
    expect(singleColor.children().eq(0).css('background-color'))
        .to.equal(yellow);

    const baseColor = withColor(
        createTd(), {color: {'current-style': 0, 'color': yellow}}, property,
        0);
    expect(baseColor.children('.box').length).to.equal(1);
    expect(baseColor.children().eq(0).css('background-color')).to.equal(yellow);

    const red = 'red';
    const discrete = withColor(
        createTd(), {
          color: {
            'current-style': 1,
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

    list.val(chai + '\n' + nutmeg);
    testSave(onListBlur, property, list, [chai, nutmeg]);
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
    cy.wrap(onDelete(rows[0])).then(() => {
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

    cy.wrap(updateAfterSort({item: rows[0]}))
        .then(() => {
          const postSortLayers = getCurrentLayers();
          expect(postSortLayers[0]['initialIndex']).equals(1);
          expect(postSortLayers[1]['initialIndex']).equals(2);
          expect(postSortLayers[2]['initialIndex']).equals(0);

          expect(rows[0].text()).equals('2');
          expect(rows[1].text()).equals('1');
          expect(rows[2].text()).equals('0');

          expect(savingStub).to.be.calledOnce;
          expect(savedStub).to.be.calledOnce;
          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(getDisaster())
              .get();
        })
        .then((doc) => {
          const layers = doc.data()['layers'];
          expect(layers[0]['initialIndex']).to.equal(1);
          expect(layers[1]['initialIndex']).to.equal(2);
          expect(layers[2]['initialIndex']).to.equal(0);
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

    cy.wrap(fxn({target: input}, property))
        .then(() => {
          expect(savingStub).to.be.calledOnce;
          expect(savedStub).to.be.calledOnce;
          expect(getCurrentLayers()[0][property]).to.eql(afterVal);
          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(getDisaster())
              .get();
        })
        .then(
            (doc) =>
                expect(doc.data()['layers'][0][property]).to.eql(afterVal));
  }
});
