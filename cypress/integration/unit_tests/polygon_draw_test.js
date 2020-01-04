import {addPolygonWithPath} from '../../../docs/basic_map.js';
import * as ErrorLib from '../../../docs/error.js';
import * as Loading from '../../../docs/loading.js';
import {initializeAndProcessUserRegions, StoredShapeData, transformGeoPointArrayToLatLng, userShapes} from '../../../docs/polygon_draw.js';
import {setUserFeatureVisibility} from '../../../docs/popup.js';
import * as resourceGetter from '../../../docs/resources.js';
import * as Toast from '../../../docs/toast.js';
import {userRegionData} from '../../../docs/user_region_data.js';
import {CallbackLatch} from '../../support/callback_latch.js';
import {cyQueue} from '../../support/commands.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';
import {convertGoogleLatLngToObject, convertPathToLatLng, createGoogleMap} from '../../support/test_map.js';

const notes = 'Sphinx of black quartz, judge my vow';

const path = [{lat: 0, lng: 0}, {lat: 4, lng: 2}, {lat: 0, lng: 2}];

/**
 * Expected data in Firestore/map popup.
 * @typedef {{damage: number, snapFraction: number, notes: string,
 * totalHouseholds: number}} ExpectedData
 */

const defaultData = {
  damage: 1,
  snapFraction: 0.1,
  totalHouseholds: 1,
  notes: '',
};

describe('Unit test for ShapeData', () => {
  loadScriptsBeforeForUnitTests('ee', 'maps', 'firebase', 'jquery');
  let damageCollection;
  before(() => {
    // Wrap StoredShapeData#update so that we can access the Promise it returns.
    // See also waitForWriteToFinish.
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

  let saveStartedStub;
  let saveFinishedStub;
  beforeEach(() => {
    // Stub out map updates, not useful for us.
    cy.stub(Loading, 'addLoadingElement');
    cy.stub(Loading, 'loadingElementFinished');
    saveStartedStub = cy.stub(Toast, 'showSavingToast');
    saveFinishedStub = cy.stub(Toast, 'showSavedToast');
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
    cy.stub(resourceGetter, 'getScoreAssetPath').returns(scoreCollection);

    setUpPage();
  });

  /**
   * Initializes the Google Map; sets up the polygon drawing manager; and sets
   * up user feature handling. No features are expected on first call, since the
   * test Firestore database is empty.
   * @return {Cypress.Chainable}
   */
  function setUpPage() {
    createGoogleMap()
        .then((mapResult) => map = mapResult)
        .then(() => {
          userRegionData.clear();
          return initializeAndProcessUserRegions(map, Promise.resolve({
            // Normally damageAssetPath is a string, but code tolerates just
            // putting an ee.FeatureCollection in.
            data: () => ({assetData: {damageAssetPath: damageCollection}}),
          }));
        })
        .then((drawingManagerResult) => drawingManager = drawingManagerResult);
    // Confirm that drawing controls are visible.
    return cy.get('[title="Draw a shape"]');
  }

  xit('Adds polygon', () => {
    drawPolygonAndClickOnIt();
    pressPopupButton('close');
  });

  xit('Updates notes and shape', () => {
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    // Clone path and edit.
    const newPath = JSON.parse(JSON.stringify(path));
    newPath[0].lng = 0.5;
    cy.get('.notes').type(notes).then(() => getFirstFeature().setPath(newPath));
    pressButtonAndWaitForPromise('save');
    assertOnFirestoreAndPopup(newPath, withNotes(notes));
  });

  xit('Deletes polygon', () => {
    drawPolygonAndClickOnIt();
    deletePolygon(cy.stub(window, 'confirm').returns(true));
  });

  xit('Almost deletes, then deletes', () => {
    drawPolygonAndClickOnIt();
    let confirmValue = false;
    const confirmStub =
        cy.stub(window, 'confirm').callsFake(() => confirmValue);
    pressPopupButton('delete').then(() => {
      expect(confirmStub).to.be.calledOnce;
      confirmStub.resetHistory();
    });
    assertOnFirestoreAndPopup(path);
    // Reload the page: polygon should still be there.
    setUpPage();
    assertOnFirestoreAndPopup(path);
    pressPopupButton('delete').then(() => {
      expect(confirmStub).to.be.calledOnce;
      confirmValue = true;
      confirmStub.resetHistory();
    });
    assertOnFirestoreAndPopup(path);
    deletePolygon(confirmStub);
  });

  /**
   * Presses a visible 'delete' button, checks that `confirmStub` was called,
   * and that the polygon is gone and there is no data in Firestore.
   * @param {Spy} confirmStub
   */
  function deletePolygon(confirmStub) {
    pressPopupButton('delete').then(() => expect(confirmStub).to.be.calledOnce);
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').should('not.contain', 'damage count');
    waitForWriteToFinish()
        .then(() => userShapes.get())
        .then((querySnapshot) => {
          expect(querySnapshot).to.have.property('size', 0);
          expect(querySnapshot.docs).to.be.empty;
        });
  }

  xit('Draws a polygon, clicks it, closes its info box', () => {
    drawPolygonAndClickOnIt();
    pressPopupButton('close');
    cy.get('#test-map-div').contains('damage count');
    cy.get('#test-map-div').contains('damage count').should('not.be.visible');
  });

  xit('Draws a polygon, almost closes while editing', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(false);
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressPopupButton('close').then(() => expect(confirmStub).to.be.calledOnce);
    pressPopupButton('save');
    cy.get('#test-map-div').contains(notes).should('be.visible');
    waitForWriteToFinish();
    assertOnFirestoreAndPopup(path, withNotes(notes));
  });

  xit('Draws a polygon, closes while editing', () => {
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressPopupButton('close').then(() => expect(confirmStub).to.be.calledOnce);
    cy.get('#test-map-div').should('not.contain', notes);
    cy.get('#test-map-div').contains('damage count');
    cy.get('#test-map-div').contains('damage count').should('not.be.visible');
    assertOnFirestoreAndPopup(path);
  });

  xit('Closes while editing reverts polygon changes', () => {
    const newPath = JSON.parse(JSON.stringify(path));
    newPath[0].lng = 0.5;
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    drawPolygonAndClickOnIt().then(() => currentUpdatePromise = null);
    pressPopupButton('edit').then(() => getFirstFeature().setPath(newPath));
    pressPopupButton('close').then(() => {
      expect(confirmStub).to.be.calledOnce;
      expect(currentUpdatePromise).to.be.null;
      expect(saveStartedStub).to.not.be.called;
      expect(convertPathToLatLng(getFirstFeature().getPath())).to.eql(path);
    });
    assertOnFirestoreAndPopup(path);
  });

  xit('Updates while update pending', () => {
    let fakeCalled = false;
    drawPolygonAndClickOnIt().then(() => {
      currentUpdatePromise = null;
      const [, data] = getFirstUserRegionDataEntry();
      // Firestore will return a new document object each time .doc is called.
      // So we can't just stub out the methods on this object.
      const realDoc = userShapes.doc(data.id);
      const realDocFunction = userShapes.doc;
      const fakeDoc = {};
      cy.stub(userShapes, 'doc').withArgs(data.id).returns(fakeDoc);
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
        // Don't reset history after this assertion: waitForWriteToFinish
        // will check this too.
        expect(saveStartedStub).to.be.calledOnce;
        expect(saveFinishedStub).to.not.be.called;
        userShapes.doc = realDocFunction;
        fakeCalled = true;
        return realDoc.set(record);
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
    pressPopupButton('save');
    // This is where the above faked-out set() gets called, triggering a new
    // write.
    assertOnPopup(withNotes('racing notes'));
    pressPopupButton('close');
    waitForWriteToFinish().then(() => expect(fakeCalled).to.be.true);
    assertOnFirestoreAndPopup(path, withNotes('racing notes'));
  });

  xit('Shows calculating before update finishes', () => {
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
    waitForWriteToFinish();
    cy.get('.popup-calculated-data')
        .should('have.css', 'color')
        .and('eq', 'rgb(0, 0, 0)');
    cy.get('.popup-calculated-data').contains('damage count: 1');
  });

  xit('Draws marker, edits notes and drags, then deletes', () => {
    // Accept confirmation when it happens.
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    const event = new Event('overlaycomplete');
    const position = {lat: 0, lng: 0};
    const newPosition = {lat: 0, lng: 1};
    event.overlay = new google.maps.Marker({map: map, position: position});
    google.maps.event.trigger(drawingManager, 'overlaycomplete', event);
    waitForWriteToFinish();
    assertMarker(position, '');
    // Found through unpleasant trial and error.
    cy.get('#test-map-div').click(310, 435);
    pressPopupButton('edit');
    cy.get('.notes').type(notes).then(
        () => getFirstFeature().setPosition(newPosition));
    pressButtonAndWaitForPromise('save');
    assertMarker(newPosition, notes);
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
   * @param {LatLngLiteral} position
   * @param {string} notes
   * @return {Cypress.Chainable}
   */
  function assertMarker(position, notes) {
    return cyQueue(() => expect(StoredShapeData.pendingWriteCount).to.eql(0))
        .then(() => userShapes.get())
        .then((querySnapshot) => {
          expect(querySnapshot).to.have.property('size', 1);
          const markerDoc = querySnapshot.docs[0];
          const firestoreId = markerDoc.id;
          expect(transformGeoPointArrayToLatLng(markerDoc.get('geometry')))
              .to.eql([
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

  xit('Skips update if nothing changed', /* @this Context */ function() {
    drawPolygonAndSetUpSpies().as('spyResult');
    pressButtonAndWaitForPromise('save').then(() => {
      expect(this.spyResult.popupPendingCalculationSpy).to.not.be.called;
      expect(this.spyResult.popupCalculatedDataSpy).to.not.be.called;
      expect(this.spyResult.eeSpy).to.not.be.called;
      expect(this.spyResult.firestoreSpy).to.not.be.called;
      assertOnFirestoreAndPopup(path);
    });
  });

  xit('Skips recalculate if geometry unchanged',
      /* @this Context */ function() {
        drawPolygonAndSetUpSpies().as('spyResult');
        cy.get('.notes').type(notes);
        pressButtonAndWaitForPromise('save').then(() => {
          expect(this.spyResult.popupPendingCalculationSpy).to.not.be.called;
          expect(this.spyResult.popupCalculatedDataSpy).to.not.be.called;
          expect(this.spyResult.eeSpy).to.not.be.called;
          expect(this.spyResult.firestoreSpy).to.be.calledOnce;
          assertOnFirestoreAndPopup(path, withNotes(notes));
        });
      });

  it('Dragged polygon triggers recalculation', /* @this Context */ function() {
    // Clone path and edit.
    const newPath = JSON.parse(JSON.stringify(path));
    newPath[0].lng = 0.5;
    drawPolygonAndSetUpSpies()
            .as('spyResult').then(() => getFirstFeature().setPath(newPath));
    pressButtonAndWaitForPromise('save').then(() => {
      expect(this.spyResult.popupPendingCalculationSpy).to.be.calledOnce;
      expect(this.spyResult.popupCalculatedDataSpy).to.be.calledOnce;
      expect(this.spyResult.eeSpy).to.be.calledOnce;
      expect(this.spyResult.firestoreSpy).to.be.calledOnce;
    });
    assertOnFirestoreAndPopup(newPath);
  });

  /**
   * Draws the default polygon and clicks on it. Then returns spies to observe
   * calculated-data-related calls made to the polygon's popup, and {@link
   * ee#List} and {@link userShapes#doc} calls. Because EE is finicky about
   * spying, the `eeSpy` returned is not actually spying on the real
   * {@link ee#List} but rather on a dummy object that shadows it, and that we
   * call with the same arguments as the real {@link ee#List}.
   * @typedef {sinon.SinonSpy|sinon.SinonStub} Spy
   * @return {Cypress.Chainable<{popupPendingCalculationSpy: Spy,
   *     popupCalculatedDataSpy: Spy, eeSpy: Spy, firestoreSpy: Spy}>}
   */
  function drawPolygonAndSetUpSpies() {
    let popupPendingCalculationSpy;
    let popupCalculatedDataSpy;
    let firestoreSpy;
    const dummyObjectForSpyAssertions = {eeListCall: () => {}};
    const eeSpy = cy.spy(dummyObjectForSpyAssertions, 'eeListCall');
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
        dummyObjectForSpyAssertions.eeListCall(list);
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

  it('handles EarthEngine error', () => {
    // Wrap ee.List so that we can throw when it evaluates.
    const oldList = ee.List;
    ee.List = (list) => {
      ee.List = oldList;
      console.log('got here somehow');
      const returnValue = ee.List(list);
      cy.stub(returnValue, 'evaluate')
          .callsFake((callback) => callback(null, 'Error evaluating list'));
      return returnValue;
    };
    doUnsuccessfulDraw();
    doSuccessfulDrawAfterFailure();
  });

  it('handles Firestore error', () => {
    const docStub = cy.stub(userShapes, 'doc').returns({
      set: cy.stub().throws(new Error('Some Firebase error')),
    });
    doUnsuccessfulDraw().then(() => docStub.restore());
    doSuccessfulDrawAfterFailure();
  });

  it('handles error then other polygon success then success', () => {
    const docStub = cy.stub(userShapes, 'doc').returns({
      set: cy.stub().throws(new Error('Some Firebase error')),
    });
    const toastStub =
        cy.stub(Toast, 'showToastMessage')
            .withArgs(
                'Latest save succeeded, but there are still 1 feature(s) not ' +
                'saved');
    const confirmStub = cy.stub(window, 'confirm').returns(true);
    doUnsuccessfulDraw().then(() => docStub.restore());
    // Draw a new polygon. It saves successfully, but doesn't say everything ok.
    drawPolygon(
        [{lat: -0.5, lng: -0.5}, {lat: 0, lng: 0}, {lat: -0.5, lng: 0}]);
    assertWriteStartedAndGetPromise().then(() => {
      expect(toastStub).to.be.calledOnce;
      toastStub.resetHistory();
    });
    // Now delete second polygon, as an extra test and to make later assertions
    // about Firestore contents true :)
    // Found through unpleasant trial and error.
    cy.get('#test-map-div').click(300, 470);
    pressPopupButton('delete');
    assertWriteStartedAndGetPromise().then(() => {
      expect(toastStub).to.be.calledOnce;
      expect(confirmStub).to.be.calledOnce;
    });
    // Try to save first polygon again: succeeds.
    doSuccessfulDrawAfterFailure();
  });

  /**
   * Tries to draw a polygon, expects failure on the save.
   * @return {Cypress.Chainable<void>}
   */
  function doUnsuccessfulDraw() {
    const errorStub = cy.stub(ErrorLib, 'showError');
    cy.wrap(errorStub).as('errorStub');
    return drawPolygon()
        .then(
            () => currentUpdatePromise.then(
                (result) => {
                  throw new Error('unexpected ' + result);
                },
                () => {}))
        .then(() => {
          expect(errorStub).to.be.calledOnce;
          errorStub.resetHistory();
          expect(saveStartedStub).to.be.calledOnce;
          saveStartedStub.resetHistory();
          expect(saveFinishedStub).to.not.be.called;
          expect(StoredShapeData.pendingWriteCount).to.eql(0);
          return userShapes.get();
        })
        .then((querySnapshot) => {
          expect(querySnapshot).to.have.property('size', 0);
          expect(querySnapshot.docs).to.be.empty;
        });
  }

  /**
   * Tries to save a polygon originally created with {@link doUnsuccessfulDraw}
   * with a modified path and expects success.
   */
  function doSuccessfulDrawAfterFailure() {
    const newPath = JSON.parse(JSON.stringify(path));
    cy.get('#test-map-div').click();
    pressPopupButton('edit').then(() => {
      // Clone path and edit.
      newPath[0].lng = 0.5;
      getFirstFeature().setPath(newPath);
    });
    pressPopupButton('save');
    waitForWriteToFinish();
    cy.get('@errorStub')
        .then((errorStub) => expect(errorStub).to.not.be.called);
    assertOnFirestoreAndPopup(newPath);
  }

  it('Absence of damage asset tolerated', () => {
    cy.wrap(initializeAndProcessUserRegions(map, Promise.resolve({
      data: () => ({assetData: {damageAssetPath: null}}),
    })));
    drawPolygon();
    const expectedData = Object.assign({}, defaultData);
    expectedData.damage = 'unknown';
    waitForWriteToFinish();
    assertOnFirestoreAndPopup(path, expectedData);
  });

  it('Hides polygon, re-shows, tries to hide during edit', () => {
    const alertStub = cy.stub(window, 'alert');
    drawPolygonAndClickOnIt().then(
        () => expect(getFirstFeatureVisibility()).to.be.true);
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    pressButtonAndWaitForPromise('save');
    cy.get('#test-map-div').contains(notes).should('be.visible');
    setUserFeatureVisibilityInCypressAndAssert(false, true);
    cy.get('#test-map-div').contains(notes).should('not.be.visible');
    // Notes is invisible even if we click on the polygon, so it's really gone.
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').contains(notes).should('not.be.visible');

    // Check box again and verify that notes box can now be brought up.
    setUserFeatureVisibilityInCypressAndAssert(true, true);
    // Notes not visible yet.
    cy.get('#test-map-div').contains(notes).should('not.be.visible');
    // Map can take a second to render polygon and send it clicks, give it time.
    cy.wait(500);
    cy.get('#test-map-div').click();
    cy.get('#test-map-div').contains(notes).should('be.visible');

    // Try to hide user features in the middle of editing: will fail.
    pressPopupButton('edit').then(() => expect(alertStub).to.not.be.called);
    setUserFeatureVisibilityInCypressAndAssert(false, false)
        .then(() => expect(alertStub).to.be.calledOnce);
    // Confirm that save is still around to be pressed.
    const newNotes = 'new notes to force save';
    cy.get('.notes').clear().type(newNotes);
    pressButtonAndWaitForPromise('save');
    assertOnFirestoreAndPopup(path, withNotes(newNotes));

    // After a save, the hide is successful.
    setUserFeatureVisibilityInCypressAndAssert(false, true);
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
    setUserFeatureVisibilityInCypressAndAssert(false, true);
    const otherPath =
        [{lng: -0.5, lat: 0.5}, {lng: -0.25, lat: 0}, {lng: -0.25, lat: 0.5}];
    drawPolygon(otherPath);
    waitForWriteToFinish();
    cy.get('#test-map-div').click(200, 300);
    pressPopupButton('edit');
    const newNotes = 'new notes';
    cy.get('.notes').type(newNotes);
    // Try to re-check the box. It will fail because we're editing.
    setUserFeatureVisibilityInCypressAndAssert(true, false).then(() => {
      expect(alertStub).to.be.calledOnce;
      alertStub.resetHistory();
      expect([...userRegionData.keys()][1].getVisible()).to.be.true;
    });

    // Save the new notes and check the box, this time it succeeds.
    pressButtonAndWaitForPromise('save');
    setUserFeatureVisibilityInCypressAndAssert(true, true).then(() => {
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
    setUserFeatureVisibilityInCypressAndAssert(false, true);
    cy.get('#test-map-div').contains(notes).should('not.be.visible');
    // Notes is invisible even if we click on the polygon, so it's really gone.
    cy.get('#test-map-div').click(200, 300);
    cy.get('#test-map-div').contains(newNotes).should('not.be.visible');
  });

  /**
   * Draws a polygon with the given path, waits for it to save to Firestore,
   * asserts that the write succeeded, clicks on the polygon, and asserts that
   * the popup has the desired default data.
   * @param {Array<LatLngLiteral>} polygonPath
   * @return {Cypress.Chainable}
   */
  function drawPolygonAndClickOnIt(polygonPath = path) {
    drawPolygon(polygonPath);
    waitForWriteToFinish();
    return assertOnFirestoreAndPopup(polygonPath);
  }

  /**
   * Triggers the creation of a polygon with the given path.
   * @param {Array<LatLngLiteral>} polygonPath Defaults to {@link path}
   * @return {Cypress.Chainable<void>}
   */
  function drawPolygon(polygonPath = path) {
    return cyQueue(
        () => addPolygonWithPath({paths: polygonPath, map}, drawingManager));
  }

  /**
   * Asserts that all Firestore writes have completed, that Firestore data
   * matches expected data, and calls {@link assertOnPopup}.
   * @param {Array<LatLngLiteral>} path
   * @param {ExpectedData} expectedData
   * @return {Cypress.Chainable}
   */
  function assertOnFirestoreAndPopup(path, expectedData = defaultData) {
    cyQueue(() => {
      expect(StoredShapeData.pendingWriteCount).to.eql(0);
      return userShapes.get();
    }).then((querySnapshot) => {
      expect(querySnapshot).to.have.property('size', 1);
      const polygonDoc = querySnapshot.docs[0];
      const firestoreId = polygonDoc.id;
      expect(transformGeoPointArrayToLatLng(polygonDoc.get('geometry')))
          .to.eql(path);
      // Calculated data doesn't have notes field, so create object without
      // notes to do comparison with Firestore data.
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
   * @return {Cypress.Chainable}
   */
  function pressButtonAndWaitForPromise(button) {
    pressPopupButton(button);
    return waitForWriteToFinish();
  }

  /**
   * Calls {@link assertWriteStartedAndGetPromise} and then asserts that
   * the write finishes.
   * @return {Cypress.Chainable}
   */
  function waitForWriteToFinish() {
    return cyQueue(() => {
             expect(saveStartedStub).to.be.calledOnce;
             saveStartedStub.resetHistory();
             return currentUpdatePromise;
           })
        .then(() => {
          expect(saveFinishedStub).to.be.calledOnce;
          saveFinishedStub.resetHistory();
        });
  }

  /**
   * Expects that a write started, then returns the current update promise,
   * during the Cypress phase of execution. Note that we don't just read
   * {@link currentUpdatePromise} when this function is called, because the
   * Cypress events will happen after the entire test's code has been executed.
   * For instance, suppose we have the following code:
   *
   *   pressPopupButton('save');
   *   assertWriteStartedAndGetPromise().then(console.log);
   *   console.log(currentUpdatePromise);
   *
   * This will first print null (from the third line), then print a promise
   * (from the second line), because when the third line is executed, Cypress
   * has not actually pressed the 'save' button yet. Only after all lines are
   * executed does Cypress go back and execute its pending commands. When that
   * happens, this function will retrieve the value of currentUpdatePromise,
   * which will be the promise returned from {@link StoredShapeData#update}.
   * @return {Cypress.Chainable}
   */
  function assertWriteStartedAndGetPromise() {
    return cyQueue(() => {
      expect(saveStartedStub).to.be.calledOnce;
      saveStartedStub.resetHistory();
      return currentUpdatePromise;
    });
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
 * @return {Array<Feature|StoredShapeData>}
 */
function getFirstUserRegionDataEntry() {
  return [...userRegionData.entries()][0];
}

/**
 * Calls {@link setUserFeatureVisibility} in the "Cypress phase" of the test
 * and asserts that it succeeds if expected. Also asserts that the first stored
 * feature has the expected visibility.
 * @param {boolean} visibility
 * @param {boolean} expectedSuccess
 * @return {Cypress.Chainable}
 */
function setUserFeatureVisibilityInCypressAndAssert(
    visibility, expectedSuccess) {
  return cyQueue(() => {
    // Visibility won't change if we expect failure.
    const expectedVisibility =
        expectedSuccess ? visibility : getFirstFeatureVisibility();
    expect(setUserFeatureVisibility(visibility)).to.eql(expectedSuccess);
    expect(getFirstFeatureVisibility())
        .to.eql(expectedSuccess ? visibility : expectedVisibility);
  });
}

/**
 * Returns the visibility attribute of the first feature stored in the {@link
 * userRegionData} map.
 * @return {boolean}
 */
function getFirstFeatureVisibility() {
  return getFirstFeature().getVisible();
}

/**
 * A feature that the user can draw on the map.
 * @typedef {google.maps.Polygon|google.maps.Marker} Feature
 */

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
