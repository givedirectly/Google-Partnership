import {gdEeStatePrefix, legacyStateDir, legacyStatePrefix} from '../../../docs/ee_paths.js';
import {getFirestoreRoot} from '../../../docs/firestore_document.js';
import {addDisaster, createOptionFrom, createStateAssetPickers, createTd, deleteDisaster, emptyCallback, getStatesAssetsFromEe, onCheck, onInputBlur, onListBlur, stateAssets, updateAfterSort, withCheckbox, withInput, withList, withType, writeNewDisaster} from '../../../docs/import/add_disaster.js';
import {disasterData, getCurrentLayers} from '../../../docs/import/add_disaster_util.js';
import {withColor} from '../../../docs/import/color_function_util.js';
import * as loading from '../../../docs/loading.js';
import {getDisaster} from '../../../docs/resources';
import {createTrs, setDisasterAndLayers, createAndAppend} from '../../support/import_test_util.js';
import {initFirebaseForUnitTest, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const KNOWN_STATE = 'WF';
const UNKNOWN_STATE = 'DN';
const KNOWN_STATE_ASSET = gdEeStatePrefix + KNOWN_STATE + '/snap';

let loadingStartedStub;
let loadingFinishedStub;

describe('Unit tests for add_disaster page', () => {
  loadScriptsBeforeForUnitTests('ee', 'firebase', 'jquery');
  initFirebaseForUnitTest();
  before(() => {
    const disasterPicker = createAndAppend('select', 'disaster');
    disasterPicker.append(createOptionFrom('2003-spring'));
    disasterPicker.append(createOptionFrom('2001-summer'));
    disasterPicker.val('2003-spring');

    createAndAppend('div', 'status').hide();
  });

  beforeEach(() => {
    const listAssetsStub = cy.stub(ee.data, 'listAssets');
    listAssetsStub.withArgs(legacyStateDir, {}, emptyCallback)
        .returns(Promise.resolve({
          'assets': [{
            id: gdEeStatePrefix + KNOWN_STATE,
          }],
        }));
    listAssetsStub.withArgs(legacyStatePrefix + KNOWN_STATE, {}, emptyCallback)
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
    loadingStartedStub = cy.stub(loading, 'addLoadingElement');
    loadingFinishedStub = cy.stub(loading, 'loadingElementFinished');

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
    cy.wrap(getStatesAssetsFromEe([KNOWN_STATE, UNKNOWN_STATE]))
        .then((assets) => {
          // tests folder type asset doesn't make it through
          expect(assets[0]).to.eql(
              [KNOWN_STATE, new Map([[KNOWN_STATE_ASSET, 'TABLE']])]);
          expect(assets[1]).to.eql([UNKNOWN_STATE, new Map()]);
          expect(ee.data.listAssets)
              .to.be.calledWith(legacyStateDir, {}, emptyCallback);
          expect(ee.data.listAssets)
              .to.be.calledWith(
                  legacyStatePrefix + KNOWN_STATE, {}, emptyCallback);
          expect(ee.data.createFolder).to.be.calledOnce;
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
    expect(known).to.contain(gdEeStatePrefix + KNOWN_STATE + '/snap,TABLE');
    expect(known.children().length).to.equal(1);
    expect($('#' + UNKNOWN_STATE + '-adder').children().length).to.equal(0);
  });

  it('writes a new disaster to firestore', () => {
    let id = '2002-winter';
    const states = ['DN, WF'];
    $('#disaster').hide();

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          expect($('#status').is(':visible')).to.be.false;
          const disasterPicker = $('#disaster');
          expect(disasterPicker.is(':visible')).to.be.true;
          expect($('#pending-disaster').is(':visible')).to.be.false;
          const options = disasterPicker.children();
          expect(options.length).to.eql(3);
          expect(options.eq(1).val()).to.eql('2002-winter');
          expect(options.eq(1).is(':selected')).to.be.true;

          // boundary condition checking
          id = '1000-a';
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.true;
          expect($('#disaster').children().eq(3).val()).to.eql('1000-a');

          // boundary condition checking
          id = '9999-z';
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.true;
          expect($('#disaster').children().eq(0).val()).to.eql('9999-z');

          return getFirestoreRoot()
              .collection('disaster-metadata')
              .doc(id)
              .get();
        })
        .then((doc) => {
          expect(doc.exists).to.be.true;
          const data = doc.data();
          expect(data['states']).to.eql(states);
          expect(data['layers']).to.eql([]);
        });
  });

  it('tries to write a disaster id that already exists', () => {
    const id = '2005-summer';
    const states = [KNOWN_STATE];

    cy.wrap(writeNewDisaster(id, states))
        .then((success) => {
          expect(success).to.be.true;
          return writeNewDisaster(id, states);
        })
        .then((success) => {
          expect(success).to.be.false;
          const status = $('#status');
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql(
                  'Error: disaster with that name and year already exists.');
        });
  });

  it('tries to write a disaster with bad info, then fixes it', () => {
    const year = createAndAppend('input', 'year');
    const name = createAndAppend('input', 'name');
    const states = createAndAppend('input', 'states');
    const status = $('#status');

    cy.wrap(addDisaster())
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql('Error: Disaster name, year, and states are required.');

          year.val('hello');
          name.val('my name is');
          states.val(['IG', 'MY']);
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text()).to.eql('Error: Year must be a number.');

          year.val('2000');
          name.val('HARVEY');
          return addDisaster();
        })
        .then((success) => {
          expect(success).to.be.false;
          expect(status.is(':visible')).to.be.true;
          expect(status.text())
              .to.eql(
                  'Error: disaster name must be comprised of only ' +
                  'lowercase letters');

          name.val('harvey');
          return addDisaster();
        })
        .then((success) => expect(success).to.be.true);
  });

  it('deletes a disaster', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(true);

    const id = '2002-winter';
    const states = ['DN, WF'];

    cy.wrap(writeNewDisaster(id, states))
        .then(
            () => getFirestoreRoot()
                      .collection('disaster-metadata')
                      .doc(id)
                      .get())
        .then((doc) => {
          expect(doc.exists).to.be.true;
          const deletePromise = deleteDisaster();
          expect(confirmStub).to.be.calledOnce;
          return deletePromise;
        })
        .then(
            () => getFirestoreRoot()
                      .collection('disaster-metadata')
                      .doc(id)
                      .get())
        .then((doc) => expect(doc.exists).to.be.false);
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

          expect(loadingStartedStub).to.be.calledOnce;
          expect(loadingFinishedStub).to.be.calledOnce;

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
        expect(getCurrentLayers()[0][property]).to.eql(afterVal);
        expect(loadingStartedStub).to.be.calledOnce;
        expect(loadingFinishedStub).to.be.calledOnce;
        return getFirestoreRoot()
            .collection('disaster-metadata')
            .doc(getDisaster())
            .get();
      })
      .then(
          (doc) => expect(doc.data()['layers'][0][property]).to.eql(afterVal));
}
