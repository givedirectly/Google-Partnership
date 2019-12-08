import * as loading from '../../../docs/loading.js';
import {initializeAndProcessUserRegions, setUpPolygonDrawing, StoredShapeData, transformGeoPointArrayToLatLng, userShapes} from '../../../docs/polygon_draw.js';
import {setUserFeatureVisibility} from '../../../docs/popup.js';
import * as resourceGetter from '../../../docs/resources.js';
import {userRegionData} from '../../../docs/user_region_data.js';
import {CallbackLatch} from '../../support/callback_latch.js';
import {initFirebaseForUnitTest, loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import {convertGoogleLatLngToObject, convertPathToLatLng, createGoogleMap} from '../../support/test_map.js';

const notes = 'Sphinx of black quartz, judge my vow';

const path = [{lat: 0, lng: 0}, {lat: 4, lng: 2}, {lat: 0, lng: 2}];
/**
 * @typedef {{damage: number, snapFraction: number, notes: string,
 * totalHouseholds: number}} ExpectedData
 * @type {ExpectedData}
 */
const defaultData = {
  damage: 1,
  snapFraction: 0.1,
  totalHouseholds: 1,
  notes: ''
};
const event = new Event('overlaycomplete');

describe('Unit test for ShapeData', () => {
  loadScriptsBeforeForUnitTests('ee', 'maps', 'firebase', 'jquery');
  initFirebaseForUnitTest();
  let damageCollection;
  before(() => {
    // Stub out loading update attempts: they pollute console with errors.
    loading.addLoadingElement = () => {};
    loading.loadingElementFinished = () => {};
    StoredShapeData.prototype.innerUpdate = StoredShapeData.prototype.update;
    StoredShapeData.prototype.update = function() {
      currentUpdatePromise = this.innerUpdate();
      return currentUpdatePromise;
    };
  });

  // Google Map.
  let map;
  // Google Maps Drawing Manager, used to trigger feature creation.
  let drawingManager;
  // Promise for currently running StoredShapeData#update call. Obtained by
  // wrapping update call.
  let currentUpdatePromise = null;

  beforeEach(() => {
    // Default polygon intersects feature1 and feature2, not feature3.
    const feature1 = ee.Feature(
        ee.Geometry.Polygon(0, 0, 0, 10, 10, 10, 10, 0),
        {'SNAP HOUSEHOLDS': 1, 'TOTAL HOUSEHOLDS': 20});
    const feature2 = ee.Feature(
        ee.Geometry.Polygon(10, 0, 10, 10, 20, 10, 20, 0),
        {'SNAP HOUSEHOLDS': 3, 'TOTAL HOUSEHOLDS': 40});
    const feature3 = ee.Feature(
        ee.Geometry.Polygon(20, 0, 20, 10, 30, 10, 30, 0),
        {'SNAP HOUSEHOLDS': 1000, 'TOTAL HOUSEHOLDS': 1000});
    const scoreCollection =
        ee.FeatureCollection([feature1, feature2, feature3]);
    // Default polygon contains only first damage point.
    damageCollection = ee.FeatureCollection([
      ee.Feature(ee.Geometry.Point([1.5, 1.5])),
      ee.Feature(ee.Geometry.Point([200, 200])),
    ]);
    // Use our custom EarthEngine FeatureCollections.
    cy.stub(resourceGetter, 'getScoreAsset').returns(scoreCollection);

    return setUpPage();
  });

  function setUpPage() {
    return createGoogleMap()
        .then((mapResult) => map = mapResult)
        .then(() => setUpPolygonDrawing(map, Promise.resolve(null)))
        .then((drawingManagerResult) => drawingManager = drawingManagerResult)
        .then(() => {
          userRegionData.clear();
          return initializeAndProcessUserRegions(map, Promise.resolve({
            data: () => ({asset_data: {damage_asset_path: damageCollection}}),
          }))
        });
  }

  it('Add polygon', () => {
    drawPolygonAndClickOnIt();
    pressPopupButton('close');
  });

  it('Update notes', () => {
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressButtonAndWaitForPromise('save').then(
        () => assertOnFirestoreAndPopup(path, withNotes(notes)));
  });

  it('Delete polygon', () => {
    drawPolygonAndClickOnIt();
    deletePolygon(cy.stub(window, 'confirm').returns(true));
  });

  it('Almost deletes, then deletes', () => {
    drawPolygonAndClickOnIt();
    let confirmValue = false;
    const confirmStub =
        cy.stub(window, 'confirm').callsFake(() => confirmValue);
    pressPopupButton('delete').then(() => {
      expect(confirmStub).to.be.calledOnce;
      confirmStub.resetHistory();
      assertOnFirestoreAndPopup(path, defaultData);
    });
    setUpPage().then(() => assertOnFirestoreAndPopup(path, defaultData));
    pressPopupButton('delete').then(() => {
      expect(confirmStub).to.be.calledOnce;
      assertOnFirestoreAndPopup(path, defaultData);
      confirmValue = true;
      confirmStub.resetHistory();
    });
    deletePolygon(confirmStub);
  });

  function deletePolygon(confirmStub) {
    pressPopupButton('delete').then(() => expect(confirmStub).to.be.calledOnce);
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').should('not.contain', 'damage count');
    getOnlyPendingUpdatePromise()
        .then(() => userShapes.get())
        .then((querySnapshot) => {
          expect(querySnapshot).to.have.property('size', 0);
          expect(querySnapshot.docs).to.be.empty;
        });
  }

  it('Draws a polygon, clicks it, closes its info box', () => {
    drawPolygonAndClickOnIt();
    pressPopupButton('close');
    cy.get('#test-map-div').contains('damage count');
    cy.get('#test-map-div').contains('damage count').should('not.be.visible');
  });

  it('Draws a polygon, almost closes while editing', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(false);
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressPopupButton('close').then(() => expect(confirmStub).to.be.calledOnce);
    pressPopupButton('save');
    cy.get('#test-map-div').contains(notes).should('be.visible');
    getOnlyPendingUpdatePromise().then(
        () => assertOnFirestoreAndPopup(path, withNotes(notes)));
  });

  it('Draws a polygon, closes while editing', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressPopupButton('close').then(() => expect(confirmStub).to.be.calledOnce);
    cy.get('#test-map-div').contains('damage count');
    cy.get('#test-map-div').contains('damage count').should('not.be.visible');
    assertOnFirestoreAndPopup(path, defaultData);
  });

  it('Closes while editing reverts polygon changes', () => {
    const newPath = JSON.parse(JSON.stringify(path));
    newPath[0].lng = 0.5;
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    drawPolygonAndClickOnIt();
    pressPopupButton('edit').then(() => {
      getFirstFeature().setPath(newPath);
    });
    pressButtonAndWaitForPromise('close').then(() => {
      expect(confirmStub).to.be.calledOnce;
      expect(convertPathToLatLng(getFirstFeature().getPath())).to.eql(path);
    });
    assertOnFirestoreAndPopup(path, defaultData);
  });

  it('Update while update pending', () => {
    let fakeCalled = false;
    drawPolygonAndClickOnIt().then(() => {
      currentUpdatePromise = null;
      const [, data] = getFirstUserRegionDataEntry();
      const realDoc = userShapes.doc(data.id);
      const realDocFunction = userShapes.doc;
      const fakeDoc = {};
      userShapes.doc = () => fakeDoc;
      fakeDoc.set = (record) => {
        // Unfortunately Cypress can't really handle executing Cypress commands
        // inside an asynchronous callback, so we rely on jquery to modify the
        // DOM. Works out ok.
        $('button:contains("edit")').trigger('click');
        $('.notes').val('racing notes');
        $('button:contains("save")').trigger('click');
        expect(currentUpdatePromise).to.be.null;
        expect(data.state).to.eql(StoredShapeData.State.QUEUED_WRITE);
        expect(StoredShapeData.pendingWriteCount).to.eql(1);
        userShapes.doc = realDocFunction;
        fakeCalled = true;
        return realDoc.set(record)
      };
    });
    cy.document().then((doc) => {
      // Lightly fake out prod document access for jquery.
      cy.stub(document, 'getElementsByTagName')
          .callsFake((id) => doc.getElementsByTagName(id));
      cy.stub(document, 'getElementsByClassName')
          .callsFake((id) => doc.getElementsByClassName(id));
    });
    pressPopupButton('edit');
    cy.get('.notes').type('new notes');
    pressButtonAndWaitForPromise('save').then(
        () => expect(fakeCalled).to.be.true);
    assertOnPopup(withNotes('racing notes'));
    assertOnFirestoreAndPopup(path, withNotes('racing notes'));
  });

  it('Shows calculating before update finishes', () => {
    // StoredShapeData#update creates an ee.List to evaluate the numbers it
    // needs. To make sure that update calculation does not finish until we're
    // ready, lightly wrap ee.List.evaluate and wait on a CallbackLatch. The
    // CallbackLatch will be released below when we're ready for the calculation
    // to be finished.
    const latch = new CallbackLatch();
    // Replace ee.List so that we can have access to the returned object and
    // change its evaluate call.
    const oldList = ee.List;
    ee.List = (list) => {
      ee.List = oldList;
      const returnValue = ee.List(list);
      // Replace returnValue.evaluate so that we can delay calling the callback
      // until the calculation is supposed to have completed.
      const oldEvaluate = returnValue.evaluate;
      returnValue.evaluate = (callback) => {
        returnValue.evaluate = oldEvaluate;
        // Do the evaluate, but don't return back to polygon_draw.update's
        // callback handler until our pre-calculation assertions are done.
        returnValue.evaluate(latch.delayedCallback(callback));
      };
      return returnValue;
    };
    drawPolygon();
    cy.get('.popup-calculated-data').contains('calculating');
    cy.get('.popup-calculated-data')
        .should('have.css', 'color')
        .and('eq', 'rgb(128, 128, 128)')
        .then(() => latch.release());
    getOnlyPendingUpdatePromise();
    cy.get('.popup-calculated-data')
        .should('have.css', 'color')
        .and('eq', 'rgb(0, 0, 0)');
    cy.get('.popup-calculated-data').contains('damage count: 1');
  });

  it('Draws marker, edits notes, then deletes', () => {
    // Accept confirmation when it happens.
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    const event = new Event('overlaycomplete');
    const position = {lat: 0, lng: 0};
    event.overlay = new google.maps.Marker({map: map, position: position});
    google.maps.event.trigger(drawingManager, 'overlaycomplete', event);
    getOnlyPendingUpdatePromise().then(() => assertMarker(position, ''));
    // Found through unpleasant trial and error.
    cy.get('#test-map-div').click(310, 435);
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressButtonAndWaitForPromise('save').then(
        () => assertMarker(position, notes));
    pressButtonAndWaitForPromise('delete')
        .then(() => {
          expect(StoredShapeData.pendingWriteCount).to.eql(0);
          return userShapes.get();
        })
        .then((querySnapshot) => {
          expect(querySnapshot).to.have.property('size', 0);
          expect(querySnapshot.docs).to.be.empty;
          expect(confirmStub).to.be.calledOnce;
        });
  });

  /**
   * Asserts that Firestore contains data for a marker at the expected position
   * and with the expected notes.
   * @param {}position
   * @param notes
   */
  function assertMarker(position, notes) {
    expect(StoredShapeData.pendingWriteCount).to.eql(0);
    cy.wrap(userShapes.get()).then((querySnapshot) => {
      expect(querySnapshot).to.have.property('size', 1);
      const markerDoc = querySnapshot.docs[0];
      const firestoreId = markerDoc.id;
      expect(transformGeoPointArrayToLatLng(markerDoc.get('geometry'))).to.eql([
        position,
      ]);
      expect(markerDoc.get('notes')).to.eql(notes);
      expect(userRegionData).to.have.property('size', 1);
      const [storedMarker, shapeData] = getFirstUserRegionDataEntry();
      expect(storedMarker.getMap()).to.eql(map);
      expect(convertGoogleLatLngToObject(storedMarker.getPosition()))
          .to.eql(position);
      expect(shapeData).to.have.property('id', firestoreId);
    });
  }

  it('Skips update if nothing changed', () => {
    let popupPendingCalculationSpy;
    let popupCalculatedDataSpy;
    let eeSpy;
    let firestoreSpy;
    drawPolygonAndSetUpSpies().then((spyResult) => ({
                                      popupPendingCalculationSpy,
                                      popupCalculatedDataSpy,
                                      eeSpy,
                                      firestoreSpy,
                                    } = spyResult));
    pressButtonAndWaitForPromise('save').then(() => {
      expect(popupPendingCalculationSpy).to.not.be.called;
      expect(popupCalculatedDataSpy).to.not.be.called;
      expect(eeSpy).to.not.be.called;
      expect(firestoreSpy).to.not.be.called;
      assertOnFirestoreAndPopup(path, defaultData);
    });
  });

  it('Skips recalculation if geometry unchanged', () => {
    let popupPendingCalculationSpy;
    let popupCalculatedDataSpy;
    let eeSpy;
    let firestoreSpy;
    drawPolygonAndSetUpSpies().then((spyResult) => ({
                                      popupPendingCalculationSpy,
                                      popupCalculatedDataSpy,
                                      eeSpy,
                                      firestoreSpy,
                                    } = spyResult));
    cy.get('.notes').type(notes);
    pressButtonAndWaitForPromise('save').then(() => {
      expect(popupPendingCalculationSpy).to.not.be.called;
      expect(popupCalculatedDataSpy).to.not.be.called;
      expect(eeSpy).to.not.be.called;
      expect(firestoreSpy).to.be.calledOnce;
      assertOnFirestoreAndPopup(path, withNotes(notes));
    });
  });

  it('Drag polygon triggers recalculation', () => {
    // Clone path and edit.
    const newPath = JSON.parse(JSON.stringify(path));
    newPath[0].lng = 0.5;
    let popupPendingCalculationSpy;
    let popupCalculatedDataSpy;
    let firestoreSpy;
    let eeSpy;
    drawPolygonAndSetUpSpies().then((spyResult) => {
      ({
        popupPendingCalculationSpy,
        popupCalculatedDataSpy,
        firestoreSpy,
        eeSpy,
      } = spyResult);
      getFirstFeature().setPath(newPath);
    });
    pressButtonAndWaitForPromise('save').then(() => {
      expect(popupPendingCalculationSpy).to.be.calledOnce;
      expect(popupCalculatedDataSpy).to.be.calledOnce;
      expect(eeSpy).to.be.calledOnce;
      expect(firestoreSpy).to.be.calledOnce;
    });
    assertOnFirestoreAndPopup(newPath, defaultData);
  });

  /**
   * Draws the default polygon and clicks on it. Then returns spies to observe
   * calculated-data-related calls made to the polygon's popup, and {@link
   * ee#List} and
   * {@link userShapes#doc} calls. Because EE is finicky about spying, the
   * `eeSpy` returned is not actually spying on the real {@link ee#List} but
   * rather on a dummy object that shadows it, and that we call with the same
   * arguments as the real {@link ee#List}.
   * @return {Cypress.Chainable<{popupPendingCalculationSpy: Cypress.Agent,
   *     popupCalculatedDataSpy: Cypress.Agent, eeSpy: Cypress.Agent,
   *     firestoreSpy: Cypress.Agent}>}
   */
  function drawPolygonAndSetUpSpies() {
    let popupPendingCalculationSpy;
    let popupCalculatedDataSpy;
    let firestoreSpy;
    const dummyObjectForSpyAssertions = {method: (args) => {}};
    const eeSpy = cy.spy(dummyObjectForSpyAssertions, 'method');
    drawPolygonAndClickOnIt().then(() => {
      const [, data] = getFirstUserRegionDataEntry();
      popupPendingCalculationSpy = cy.spy(data.popup, 'setPendingCalculation');
      popupCalculatedDataSpy = cy.spy(data.popup, 'setCalculatedData');
      firestoreSpy = cy.spy(userShapes, 'doc');
      // Wrap ee.List so that we can track that it was called. Sadly cy.spy is
      // not delicate enough for this.
      const oldList = ee.List;
      const trackingFunction = (list) => {
        ee.List = oldList;
        dummyObjectForSpyAssertions.method(list);
        const returnValue = ee.List(list);
        ee.List = trackingFunction;
        return returnValue;
      };
      ee.List = trackingFunction;
    });
    return pressPopupButton('edit').then(() => ({
                                           popupPendingCalculationSpy,
                                           popupCalculatedDataSpy,
                                           eeSpy,
                                           firestoreSpy,
                                         }));
  }

  it('Absence of damage asset tolerated', () => {
    cy.wrap(initializeAndProcessUserRegions(map, Promise.resolve({
      data: () => ({asset_data: {damage_asset_path: null}}),
    })));
    drawPolygon();
    const expectedData = Object.assign({}, defaultData);
    expectedData.damage = 'unknown';
    getOnlyPendingUpdatePromise().then(
        () => assertOnFirestoreAndPopup(path, expectedData));
  });

  it('Hides polygon, re-shows, tries to hide during edit', () => {
    const alertStub = cy.stub(window, 'alert');
    drawPolygonAndClickOnIt().then(
        () => expect(getFirstFeatureVisibility()).to.be.true);
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressButtonAndWaitForPromise('save');
    cy.get('#test-map-div').contains(notes).should('be.visible');
    cy.wrap(null)
        .then(() => setUserFeatureVisibility(false))
        .then(() => expect(getFirstFeatureVisibility()).to.be.false);
    cy.get('#test-map-div').contains(notes).should('not.be.visible');
    // Notes is invisible even if we click on the polygon, so it's really gone.
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').contains(notes).should('not.be.visible');

    // Check box again and verify that notes box can now be brought up.
    cy.wrap(null)
        .then(() => setUserFeatureVisibility(true))
        .then(() => expect(getFirstFeatureVisibility()).to.be.true);
    // Notes not visible yet.
    cy.get('#test-map-div').contains(notes).should('not.be.visible');
    cy.wait(500);
    // cy.get('#test-map-div').click(600, 300);
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').contains(notes).should('be.visible');

    // Try to hide user features in the middle of editing: will fail.
    pressPopupButton('edit').then(() => expect(alertStub).to.not.be.called);
    cy.wrap(null).then(() => setUserFeatureVisibility(false)).then(() => {
      expect(alertStub).to.be.calledOnce;
      expect(getFirstFeatureVisibility()).to.be.true;
    });
    // Confirm that save is still around to be pressed.
    const newNotes = 'new notes to force save';
    cy.get('.notes').clear().type(newNotes);
    pressButtonAndWaitForPromise('save');
    assertOnFirestoreAndPopup(path, withNotes(newNotes));

    // After a save, the hide is successful.
    cy.wrap(null)
        .then(() => setUserFeatureVisibility(false))
        .then(() => expect(getFirstFeatureVisibility()).to.be.false);
    cy.get('#test-map-div').contains(newNotes);
    cy.get('#test-map-div').contains(newNotes).should('not.be.visible');
  });

  it('Hides, draws new one, tries to hide during edit, re-shows, hides', () => {
    const alertStub = cy.stub(window, 'alert');
    drawPolygonAndClickOnIt().then(
        () => expect(getFirstFeatureVisibility()).to.be.true);
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressButtonAndWaitForPromise('save');
    cy.get('#test-map-div').contains(notes).should('be.visible');
    cy.wrap(null).then(() => setUserFeatureVisibility(false));
    const otherPath =
        [{lng: -0.5, lat: 0.5}, {lng: -0.25, lat: 0}, {lng: -0.25, lat: 0.5}];
    drawPolygon(otherPath);
    getOnlyPendingUpdatePromise();
    // cy.get('[title="Add a marker"]').click();
    cy.get('#test-map-div').click(200, 300);
    pressPopupButton('edit');
    const newNotes = 'new notes';
    cy.get('.notes').type(newNotes);
    // Try to re-check the box. It will fail because we're editing.
    cy.wrap(null).then(() => setUserFeatureVisibility(true)).then(() => {
      expect(alertStub).to.be.calledOnce;
      alertStub.resetHistory();
      const polygons = [...userRegionData.keys()];
      expect(polygons[0].getVisible()).to.be.false;
      expect(polygons[1].getVisible()).to.be.true;
    });

    // Save the new notes and check the box, this time it succeeds.
    pressButtonAndWaitForPromise('save');
    cy.wrap(null).then(() => setUserFeatureVisibility(true)).then(() => {
      expect(alertStub).to.not.be.called;
      for (const polygon of userRegionData.keys()) {
        expect(polygon.getVisible()).to.be.true;
      }
    });
    // We can click on the old polygon and view its notes,
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').contains(notes).should('be.visible');
    // And the new polygon and view its notes.
    cy.get('#test-map-div').click(200, 300);
    cy.get('#test-map-div').contains(newNotes).should('be.visible');

    // Now hide both polygons, and verify that they're really gone.
    cy.wrap(null)
        .then(() => setUserFeatureVisibility(false))
        .then(() => expect(getFirstFeatureVisibility()).to.be.false);
    cy.get('#test-map-div').contains(notes).should('not.be.visible');
    // Notes is invisible even if we click on the polygon, so it's really gone.
    cy.get('#test-map-div').click(200, 300);
    cy.get('#test-map-div').contains(newNotes).should('not.be.visible');
  });

  /**
   * Draws a polygon with the given path, waits for it to save to Firestore,
   * asserts that the write succeeded and the map has the desired polygon data,
   * and clicks on the polygon.
   * @param {Array<LatLngLiteral>} polygonPath
   * @return {Cypress.Chainable<void>}
   */
  function drawPolygonAndClickOnIt(polygonPath = path) {
    drawPolygon(polygonPath);
    return getOnlyPendingUpdatePromise().then(
        () => assertOnFirestoreAndPopup(polygonPath, defaultData));
  }

  /**
   * Triggers the creation of a polygon with the given path.
   * @param {Array<LatLngLiteral>} polygonPath Defaults to {@link path}
   */
  function drawPolygon(polygonPath = path) {
    cy.wrap(null).then(() => {
      event.overlay = new google.maps.Polygon({
        map: map,
        paths: polygonPath,
      });
      google.maps.event.trigger(drawingManager, 'overlaycomplete', event);
    });
  }

  /**
   * Asserts that all Firestore writes have completed, that Firestore data
   * matches expected data, and calls {@link assertOnPopup}.
   * @param {Array<LatLngLiteral>} path
   * @param {ExpectedData} expectedData
   * @return {Cypress.Chainable}
   */
  function assertOnFirestoreAndPopup(path, expectedData) {
    cy.wrap(null)
        .then(() => expect(StoredShapeData.pendingWriteCount).to.eql(0))
        .then(() => userShapes.get())
        .then((querySnapshot) => {
          expect(querySnapshot).to.have.property('size', 1);
          const polygonDoc = querySnapshot.docs[0];
          const firestoreId = polygonDoc.id;
          expect(transformGeoPointArrayToLatLng(polygonDoc.get('geometry')))
              .to.eql(path);
          const calculatedData = Object.assign({}, expectedData);
          delete calculatedData.notes;
          expect(polygonDoc.get('calculatedData')).to.eql(calculatedData);
          expect(polygonDoc.get('notes')).to.eql(expectedData.notes);
          expect(userRegionData).to.have.property('size', 1);
          const [storedPolygon, shapeData] = getFirstUserRegionDataEntry();
          expect(storedPolygon.getMap()).to.eql(map);
          expect(convertPathToLatLng(storedPolygon.getPath())).to.eql(path);
          expect(shapeData).to.have.property('id', firestoreId);
        });
    return assertOnPopup(expectedData);
  }

  /**
   * Clicks on map to bring up polygon popup and asserts on contents.
   * @param {ExpectedData} expectedData
   * @return {Cypress.Chainable}
   */
  function assertOnPopup(expectedData) {
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').contains('damage count: ' + expectedData.damage);
    cy.get('#test-map-div')
        .contains('approximate SNAP fraction: ' + expectedData.snapFraction);
    cy.get('#test-map-div')
        .contains(
            'approximate total households: ' + expectedData.totalHouseholds);
    if (expectedData.notes) {
      return cy.get('#test-map-div').contains(expectedData.notes);
    } else {
      return cy.wrap(null);
    }
  }

  /**
   * Presses the given button ('save' or 'delete') and waits for any pending
   * writes to complete.
   * @param {string} button Text of button to press
   * @return {Cypress.Chainable<Promise<void>>}
   */
  function pressButtonAndWaitForPromise(button) {
    pressPopupButton(button);
    return getOnlyPendingUpdatePromise();
  }

  /**
   * Returns a Cypress Chainable containing the current update promise in
   * Cypress execution order. This is not just {@link currentUpdatePromise} when
   * this function is called, because the Cypress events will happen after the
   * entire test's code has been executed. For instance, suppose we have the
   * following code:
   *
   *   pressPopupButton('save');
   *   getOnlyPendingUpdatePromise().then(console.log);
   *   console.log(currentUpdatePromise);
   *
   * This will first print null (from the third line), then print a promise
   * (from the second line), because when the third line is executed, Cypress
   * has not actually pressed the 'save' button yet. Only after all lines are
   * executed does Cypress go back and execute its pending commands. When that
   * happens, this function will return the value of currentUpdatePromise, which
   * will be the promise returned from {@link StoredShapeData#update}.
   * @return {Cypress.Chainable<Promise<void>>}
   */
  function getOnlyPendingUpdatePromise() {
    return cy.wait(0).then(() => currentUpdatePromise);
  }
});

/**
 * Clicks a button inside the map with the given id.
 * @param {string} button id of html button we want to click
 * @return {Cypress.Chainable} result of get
 */
function pressPopupButton(button) {
  return cy.get(':button:visible').contains(button).click();
}

/**
 * Gets the first (feature, StoredShapeData) pair in the {@link userRegionData}
 * map.
 * @return {Array<google.maps.Polygon|google.maps.Marker|StoredShapeData>}
 */
function getFirstUserRegionDataEntry() {
  return [...userRegionData.entries()][0];
}

/**
 * Returns the visibility attribute of the first feature stored in the {@link
 * userRegionData} map.
 * @return {boolean}
 */
function getFirstFeatureVisibility() {
  return getFirstFeature().getVisibility();
}

/**
 * Returns the first feature stored in the {@link userRegionData} map.
 * @return {Feature}
 */
function getFirstFeature() {
  return [...userRegionData.keys()][0];
}

/**
 * Creates an expectedData object based on {@link defaultData} with notes set.
 * @param {string} notes Expected notes
 * @return {ExpectedData}
 */
function withNotes(notes) {
  const newData = Object.assign({}, defaultData);
  newData.notes = notes;
  return newData;
}

/** @typedef {google.maps.Polygon|google.maps.Marker} Feature */