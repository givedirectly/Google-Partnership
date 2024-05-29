import {reloadWithSignIn} from './authenticate.js';
import {getCheckBoxRowId, partiallyHandleBadRowAndReturnCheckbox} from './checkbox_util.js';
import {mapContainerId} from './dom_constants.js';
import {convertEeObjectToPromise} from './ee_promise_cache.js';
import {showError} from './error.js';
import {AUTHENTICATION_ERROR_CODE} from './firebase_privileges.js';
import {userFeatures} from './firestore_document.js';
import {POLYGON_HELP_URL} from './help.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {latLngToGeoPoint, polygonToGeoPointArray, transformGeoPointArrayToLatLng} from './map_util.js';
import {createPopup, isMarker, setUpPopup} from './popup.js';
import {povertyHouseholdsTag, totalHouseholdsTag} from './property_names.js';
import {getScoreAssetPath} from './resources.js';
import {showSavedToast, showSavingToast, showToastMessage} from './toast.js';
import {userRegionData} from './user_region_data.js';

export {
  displayCalculatedData,
  initializeAndProcessUserRegions,
  userFeaturesColor,
};
// For testing.
export {
  StoredShapeData,
  transformGeoPointArrayToLatLng,
  userShapesCollection,
};

let damageAssetPath = null;

/**
 * Class holding data for a user-drawn feature (marker or polygon), including
 * the state of writing to the backend. In contrast with the Popup class, this
 * class corresponds to data that has been written to the backend. However, it
 * keeps a reference to the corresponding Popup object so that it can inform it
 * when data is calculated and retrieve user-modified values.
 */
class StoredShapeData {
  /**
   * @constructor
   *
   * @param {?String} id Firestore id. Null if user has just created feature
   * @param {?String} notes User-entered notes. Null if user has just created
   *     feature
   * @param {?Array<firebase.firestore.GeoPoint>} featureGeoPoints Null if user
   *     has just created feature
   * @param {Popup} popup
   */
  constructor(id, notes, featureGeoPoints, popup) {
    this.id = id;
    this.featureGeoPoints = featureGeoPoints;
    this.lastNotes = notes;
    /** @const */
    this.popup = popup;
    this.state = StoredShapeData.State.SAVED;
  }

  /**
   * Decrements write count and pops up 'Saved' message if all writes done.
   * @param {boolean} success True if this write succeeded
   */
  noteWriteFinished(success) {
    StoredShapeData.pendingWriteCount--;
    if (success) {
      if (this.errorSaving) {
        this.errorSaving = false;
        StoredShapeData.errorCount--;
      }
    } else {
      if (!this.errorSaving) {
        this.errorSaving = true;
        StoredShapeData.errorCount++;
      }
    }
    if (StoredShapeData.errorCount === 0 &&
        StoredShapeData.pendingWriteCount === 0) {
      showSavedToast();
    } else if (StoredShapeData.pendingWriteCount === 0 && success) {
      showToastMessage(
          'Latest save succeeded, but there are still ' +
          StoredShapeData.errorCount + ' feature(s) not saved');
    }
  }

  /**
   * Writes this shape's data to the backend, using the existing id
   * field, or adding a new document to Firestore if there is no id. New values
   * are retrieved from the popup object.
   *
   * If there is already a pending write, this method records that another write
   * should be performed when the pending one completes and returns immediately.
   * @return {?Promise} Promise that resolves when all writes queued when this
   *     call started are complete, or null if there were already writes in
   *     flight, in which case this method does not know when those writes will
   *     complete.
   */
  update() {
    if (this.state !== StoredShapeData.State.SAVED) {
      this.state = StoredShapeData.State.QUEUED_WRITE;
      return null;
    }
    showSavingToast();
    StoredShapeData.pendingWriteCount++;
    return this.updateWithoutStatusChange();
  }

  /**
   * Writes this shape's data to the backend, using the existing id
   * field, or adding a new document to Firestore if there is no id. New values
   * are retrieved from the popup object.
   * @return {!Promise} Promise that resolves when all writes queued when this
   *     call started are complete.
   */
  async updateWithoutStatusChange() {
    const feature = this.popup.mapFeature;
    this.state = StoredShapeData.State.WRITING;
    if (!feature.getMap()) {
      return this.delete();
    }
    const newGeometry = StoredShapeData.featureGeoPoints(feature);
    const geometriesEqual = StoredShapeData.compareGeoPointArrays(
        this.featureGeoPoints, newGeometry);
    const newNotesEqual = this.lastNotes === this.popup.notes;
    this.lastNotes = this.popup.notes;
    if (geometriesEqual) {
      if (!newNotesEqual) {
        return this.doRemoteUpdate();
      } else {
        // Because Javascript is single-threaded, during the execution of this
        // method, no additional queued writes can have accumulated. So we don't
        // need to check for them.
        this.noteWriteFinished(true);
      }

      return Promise.resolve();
    }
    this.featureGeoPoints = newGeometry;
    if (isMarker(feature)) {
      // No calculated data for a marker.
      return this.doRemoteUpdate();
    }
    this.popup.setPendingCalculation();

    const points = [];
    feature.getPath().forEach((elt) => console.log('elt', elt.lng(), elt.lat()));
    feature.getPath().forEach((elt) => points.push(elt.lng(), elt.lat()));
    const polygon = ee.Geometry.Polygon(points);
    const numDamagePoints = StoredShapeData.prepareDamageCalculation(polygon);
    const intersectingBlockGroups =
        StoredShapeData.getIntersectingBlockGroups(polygon);
    console.log('intersecting', await convertEeObjectToPromise(intersectingBlockGroups));
    // TODO(janakr): with arbitrary data, only a "poverty percentage" may be
    //  available, as opposed to underlying totals. This won't work then.
    const weightedSnapHouseholds = StoredShapeData.calculateWeightedTotal(
        intersectingBlockGroups, povertyHouseholdsTag);
    console.log('weighted', await convertEeObjectToPromise(weightedSnapHouseholds));
    const weightedTotalHouseholds = StoredShapeData.calculateWeightedTotal(
        intersectingBlockGroups, totalHouseholdsTag);
    console.log('weighted total', await convertEeObjectToPromise(weightedTotalHouseholds));
    let eeResult;
    try {
      eeResult = await convertEeObjectToPromise(ee.List([
        numDamagePoints,
        weightedSnapHouseholds,
        weightedTotalHouseholds,
      ]));
    } catch (err) {
      this.terminateWriteWithError(err, 'calculating data for polygon');
    }
    console.log('result', eeResult);
    const calculatedData = {
      damage: eeResult[0],
      snapFraction:
          eeResult[2] > 0 ? roundToOneDecimal(eeResult[1] / eeResult[2]) : 0,
      totalHouseholds: Math.round(eeResult[2]),
    };
    this.popup.setCalculatedData(calculatedData);
    try {
      await this.doRemoteUpdate();
    } catch (err) {
      this.terminateWriteWithError(err, 'writing polygon to backend');
    }
  }

  /**
   * In case of an error when calculating data or writing to Firestore, cleans
   * up and throws the error.
   * @param {Error} err Error whose message will be shown to user, and thrown
   * @param {string} message Message to show to user, along with hint about how
   *     to recover
   * @throws {Error} Always throws `err`, never returns
   */
  terminateWriteWithError(err, message) {
    showError(
        err,
        'Error ' + message +
            '. Try editing the shape and saving again: ' + err.message);
    this.noteWriteFinished(false);
    this.state = StoredShapeData.State.SAVED;
    throw err;
  }

  /**
   * @return {LatLng|Array<LatLng>} saved geometry of feature, either array of
   *     single
   * point for a Marker or an array for a Polygon to use when reverting edits.
   */
  getSavedFeatureGeometry() {
    const result = transformGeoPointArrayToLatLng(this.featureGeoPoints);
    return result.length === 1 ? result[0] : result;
  }

  /**
   * Kicks off Firestore remote write.
   * @return {Promise} Promise that completes when write is complete
   */
  doRemoteUpdate() {
    const record = {
      geometry: this.featureGeoPoints,
      notes: this.popup.notes,
      calculatedData: this.popup.calculatedData,
    };
    if (this.id) {
      return userShapesCollection.doc(this.id).set(record).then(
          () => this.finishWriteAndMaybeWriteAgain());
    } else {
      return userShapesCollection.add(record).then((docRef) => {
        this.id = docRef.id;
        return this.finishWriteAndMaybeWriteAgain();
      });
    }
  }

  /**
   * After a write completes, checks if there are pending writes and kicks off
   * a new update if so.
   * @return {!Promise} Promise that completes when all currently known writes
   *    are done
   */
  finishWriteAndMaybeWriteAgain() {
    const oldState = this.state;
    this.state = StoredShapeData.State.SAVED;
    switch (oldState) {
      case StoredShapeData.State.WRITING:
        this.noteWriteFinished(true);
        return Promise.resolve();
      case StoredShapeData.State.QUEUED_WRITE:
        return this.updateWithoutStatusChange();
      case StoredShapeData.State.SAVED:
        console.error('Unexpected feature state:' + this);
    }
  }

  /**
   * Deletes our feature from storage and userRegionData. Only for internal use
   * (would be "private" in Java).
   * @return {Promise} Promise that completes when deletion is complete.
   */
  async delete() {
    // Feature has been removed from map, we should delete on backend.
    userRegionData.delete(this.popup.mapFeature);
    // Even if the user creates a feature and then deletes it immediately, the
    // creation should trigger an update that must complete before the deletion
    // gets here. So there should always be an id.
    // Nothing more needs to be done for this element because it is
    // unreachable and about to be GC'ed.
    try {
      await userShapesCollection.doc(this.id).delete();
    } catch (err) {
      showError({err, polygon: this}, 'Error deleting polygon');
      throw err;
    } finally {
      this.noteWriteFinished(true);
    }
  }
}

// Inline static variables not supported in Cypress browser.
StoredShapeData.State = {
  /** Current state is same as that in backend. */
  SAVED: 0,
  /** Current state is being written to backend. No other writes needed. */
  WRITING: 1,
  /**
   * After the current write finishes, another write is needed because user
   * modified region after current write started.
   */
  QUEUED_WRITE: 2,
};
Object.freeze(StoredShapeData.State);

// Tracks global pending writes so that we can warn if user leaves page early
// and tell user when all saves completed.
StoredShapeData.pendingWriteCount = 0;

StoredShapeData.errorCount = 0;

StoredShapeData.featureGeoPoints = (feature) => isMarker(feature) ?
    [latLngToGeoPoint(feature.getPosition())] :
    polygonToGeoPointArray(feature);

StoredShapeData.compareGeoPointArrays = (array1, array2) => {
  // Catch if one argument is null/undefined.
  if (!array1 !== !array2) {
    return false;
  }

  if (array1.length !== array2.length) {
    return false;
  }
  for (let i = 0; i < array1.length; i++) {
    if (!array1[i].isEqual(array2[i])) {
      return false;
    }
  }
  return true;
};

StoredShapeData.prepareDamageCalculation = (polygon) => {
  return damageAssetPath ?
      ee.FeatureCollection(damageAssetPath).filterBounds(polygon).size() :
      ee.String('unknown');
};

StoredShapeData.getIntersectingBlockGroups = (polygon) => {
  return ee.FeatureCollection(getScoreAssetPath())
      .filterBounds(polygon)
      .map((feature) => {
        const geometry = feature.geometry();
        return feature.set(
            'blockGroupFraction',
            geometry.intersection(polygon).area().divide(geometry.area()));
      });
};

StoredShapeData.calculateWeightedTotal =
    (intersectingBlockGroups, property) => {
      return intersectingBlockGroups
          .map((feature) => {
            return new ee.Feature(null, {
              'weightedSum': ee.Number(feature.get(property))
                                 .multiply(feature.get('blockGroupFraction')),
            });
          })
          .aggregate_sum('weightedSum');
    };

/**
 * Renders the given calculated data into the given div.
 * @param {Object} calculatedData Coming from Firestore doc retrieval
 * @param {HTMLDivElement} parentDiv
 */
function displayCalculatedData(calculatedData, parentDiv) {
  $(parentDiv).append([
    divWithText('damage count: ' + calculatedData.damage),
    divWithText('approximate SNAP fraction: ' + calculatedData.snapFraction),
    divWithText(
        'approximate total households: ' + calculatedData.totalHouseholds),
  ]);
}

/**
 * Helper function to create a new div element with the given text.
 * @param {string} text
 * @return {JQuery<HTMLDivElement>}
 */
function divWithText(text) {
  return $(document.createElement('div')).text(text);
}

// TODO(janakr): should this be initialized somewhere better?
// Warning before leaving the page.
window.onbeforeunload = () =>
    StoredShapeData.pendingWriteCount > 0 ? true : null;

let userShapesCollection = null;

const userFeaturesColor = '#00FFFF';

const appearance = {
  fillColor: userFeaturesColor,
  strokeColor: userFeaturesColor,
  editable: false,
  // Default stroke weight looks to be about 3.
  strokeWeight: 5,
};

/**
 * Create a Google Maps Drawing Manager for drawing polygons and markers.
 *
 * @param {google.maps.Map} map
 * @return {google.maps.drawing.DrawingManager}
 */
function setUpPolygonDrawing(map) {
  const drawingManager = new google.maps.drawing.DrawingManager({
    drawingControl: true,
    drawingControlOptions: {drawingModes: ['marker', 'polygon']},
    polygonOptions: appearance,
  });

  drawingManager.addListener('overlaycomplete', (event) => {
    const feature = event.overlay;
    if (!isMarker(feature) && feature.getPath().length < 3) {
      // https://b.corp.google.com/issues/35821407 (WNF) means that users will
      // not be able to later edit the polygon to have fewer than three
      // vertices, so checking here is sufficient to prevent degenerates.
      alert('Polygons with fewer than three vertices are not supported');
      feature.setMap(null);
      return;
    }
    const popup = createPopup(feature, map, '');
    const data = new StoredShapeData(null, null, null, popup);
    userRegionData.set(feature, data);
    data.update();
  });

  drawingManager.setMap(map);
  // Add the help link.
  // Seems to be a bug in Google Maps where just doing "insertAt" once the map
  // is displayed doesn't put help link in correct position, so we empty out
  // controls and recreate.
  const controls = map.controls[google.maps.ControlPosition.TOP_LEFT];
  // Make a copy, since array is live.
  const currentControls = [...controls.getArray()];
  controls.clear();
  controls.push(createHelpIcon(POLYGON_HELP_URL));
  currentControls.forEach((elt) => controls.push(elt));

  return drawingManager;
}

/**
 * Creates a help icon linking to the given URL. Does not insert into document.
 * @param {string} url
 * @return {HTMLSpanElement} Span with icon, to insert into document somewhere
 */
function createHelpIcon(url) {
  // Add the help link.
  const helpContainer = document.createElement('span');
  helpContainer.style.padding = '6px';
  const helpLink = document.createElement('a');
  helpLink.href = url;
  helpLink.target = '_blank';
  helpLink.style.fontSize = '18px';
  const helpIcon = document.createElement('i');
  helpIcon.className = 'help fa fa-question-circle';
  helpIcon.setAttribute('aria-hidden', 'true');
  helpLink.appendChild(helpIcon);
  helpContainer.appendChild(helpLink);
  helpContainer.title = 'Help';
  return helpContainer;
}

/**
 * Retrieves user-defined regions from Firestore and displays them on given map.
 * Adds a listener to display notes on pop-up. Stores EE path for damage asset.
 *
 * @param {google.maps.Map} map Map to display regions on
 * @param {Promise<ScoreParameters>} firebasePromise Promise with Firebase
 *     damage data (also implies that authentication is complete)
 * @param {Promise<Map<string, ShapeDocument>>} userShapesPromise Promise with
 *     user shapes data
 * @return {Promise<?google.maps.drawing.DrawingManager>} Promise with drawing
 *     manager added to map (only used by tests). Null if there was an error
 */
async function initializeAndProcessUserRegions(
    map, firebasePromise, userShapesPromise) {
  setUpPopup();
  addLoadingElement(mapContainerId);
  try {
    // Firebase retrieval error handled elsewhere. Let this throw if it throws.
    ({damageAssetPath} = await firebasePromise);
    // Damage asset may not exist yet, so this is undefined. We tolerate
    // gracefully.
    let shapes;
    try {
      userShapesCollection = userFeatures();
      shapes = await userShapesPromise;
    } catch (err) {
      handleUserShapesError(err);
      return null;
    }
    drawRegions(shapes, map);
    return setUpPolygonDrawing(map);
  } finally {
    loadingElementFinished(mapContainerId);
  }
}

const USER_FEATURES_DIALOG =
    '<div>Sign in to authorized account to view user-drawn features</div>';

/**
 * Handles errors thrown from retrieving user-defined features, most likely due
 * to authentication issues.
 * @param {Error|firebase.FirebaseError} err
 */
function handleUserShapesError(err) {
  const userFeaturesRow = $('#' + getCheckBoxRowId('user-features'));
  const checkbox = partiallyHandleBadRowAndReturnCheckbox(userFeaturesRow);
  if (err.code === AUTHENTICATION_ERROR_CODE) {
    showError('Viewing as public, private data not available', null);
    userFeaturesRow.prop(
        'title',
        'User features not available: please click to log in to authorized ' +
            'account');
    const popUpDialog = () => {
      checkbox.prop('checked', false);
      const dialogParent = $(USER_FEATURES_DIALOG);
      const dialog = dialogParent.dialog({
        buttons: [
          {text: 'Sign in', click: reloadWithSignIn},
          {text: 'Close', click: () => dialog.dialog('close')},
        ],
        modal: true,
        width: 600,
        close: () => {
          // Don't try to reuse the dialog.
          dialogParent.empty();
          dialogParent.remove();
        },
      });
    };
    // TODO(ruthtalbot): Add documentation for public-facing page, mentioning
    //  that user features will be missing, and also with instructions for GD
    //  people who may get here about how to add themselves to Firestore.
    userFeaturesRow.append(createHelpIcon(POLYGON_HELP_URL));
    checkbox.on('click', popUpDialog);
  } else {
    showError(err, 'Error retrieving user-drawn features. Try refreshing page');
    checkbox.prop('disabled', true);
  }
}

/**
 * Helper function that actually does drawing on map when Firestore query
 * completes.
 *
 * @param {Map<string, ShapeDocument>} shapes user shapes by doc id -> data
 * @param {google.maps.Map} map Map to display regions on
 */
function drawRegions(shapes, map) {
  shapes.forEach((userDefinedRegion, id) => {
    const {geometry, notes, calculatedData: shapeData} = userDefinedRegion;
    const coordinates = transformGeoPointArrayToLatLng(geometry);
    let feature;
    let calculatedData = null;
    // We distinguish polygons and markers in Firestore just via the number of
    // coordinates: polygons have at least 3, and markers have only 1.
    if (coordinates.length === 1) {
      feature =
          new google.maps.Marker({draggable: false, position: coordinates[0]});
    } else {
      const properties = Object.assign({}, appearance);
      properties.paths = coordinates;
      feature = new google.maps.Polygon(properties);
      calculatedData = shapeData;
    }
    const popup = createPopup(feature, map, notes, calculatedData);
    userRegionData.set(
        feature, new StoredShapeData(id, notes, geometry, popup));
    feature.setMap(map);
  });
}

/**
 * Rounds the given number to one decimal place.
 * @param {number} number
 * @return {number}
 */
function roundToOneDecimal(number) {
  return Math.round(10 * number) / 10;
}
