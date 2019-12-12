import {mapContainerId, writeWaiterId} from './dom_constants.js';
import {createError} from './error.js';
import {getFirestoreRoot} from './firestore_document.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {latLngToGeoPoint, pathToGeoPointArray, transformGeoPointArrayToLatLng} from './map_util.js';
import {createPopup, isMarker, setUpPopup} from './popup.js';
import {snapPopTag, totalPopTag} from './property_names.js';
import {getScoreAsset} from './resources.js';
import {userRegionData} from './user_region_data.js';

// StoredShapeData is only for testing.
export {
  displayCalculatedData,
  initializeAndProcessUserRegions,
  setUpPolygonDrawing,
};
// For testing.
export {StoredShapeData, transformGeoPointArrayToLatLng, userShapes};

let damageAsset = null;

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

  /** Decrements write count and finishes a load for {@link writeWaiterId}. */
  noteWriteFinished() {
    StoredShapeData.pendingWriteCount--;
    loadingElementFinished(writeWaiterId);
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
   * flight, in which case this method does not know when those writes will
   * complete.
   */
  update() {
    if (this.state !== StoredShapeData.State.SAVED) {
      this.state = StoredShapeData.State.QUEUED_WRITE;
      return null;
    }
    const feature = this.popup.mapFeature;
    addLoadingElement(writeWaiterId);
    this.state = StoredShapeData.State.WRITING;
    StoredShapeData.pendingWriteCount++;
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
        this.noteWriteFinished();
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
    feature.getPath().forEach((elt) => points.push(elt.lng(), elt.lat()));
    const polygon = ee.Geometry.Polygon(points);
    const numDamagePoints = StoredShapeData.prepareDamageCalculation(polygon);
    const intersectingBlockGroups =
        StoredShapeData.getIntersectingBlockGroups(polygon);
    const weightedSnapHouseholds = StoredShapeData.calculateWeightedTotal(
        intersectingBlockGroups, snapPopTag);
    const weightedTotalHouseholds = StoredShapeData.calculateWeightedTotal(
        intersectingBlockGroups, totalPopTag);
    return new Promise(((resolve, reject) => {
      ee.List([
          numDamagePoints,
          weightedSnapHouseholds,
          weightedTotalHouseholds,
        ]).evaluate((list, failure) => {
        if (failure) {
          createError('calculating data ' + this)(failure);
          reject(failure);
          return;
        }
        const calculatedData = {
          damage: list[0],
          snapFraction: list[2] > 0 ? roundToOneDecimal(list[1] / list[2]) : 0,
          totalHouseholds: Math.round(list[2]),
        };
        this.popup.setCalculatedData(calculatedData);

        this.doRemoteUpdate()
            .then(() => resolve(null))
            .catch((err) => reject(err));
      });
    }));
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
      return userShapes.doc(this.id).set(record).then(
          () => this.finishWriteAndMaybeWriteAgain());
    } else {
      return userShapes.add(record).then((docRef) => {
        this.id = docRef.id;
        return this.finishWriteAndMaybeWriteAgain();
      });
    }
  }

  /**
   * After a write completes, checks if there are pending writes and kicks off
   * a new update if so.
   * @return {!Promise} Promise that completes when all currently known writes
   *    are done (or null if an unexpected error is encountered)
   */
  finishWriteAndMaybeWriteAgain() {
    StoredShapeData.pendingWriteCount--;
    const oldState = this.state;
    this.state = StoredShapeData.State.SAVED;
    switch (oldState) {
      case StoredShapeData.State.WRITING:
        loadingElementFinished(writeWaiterId);
        return Promise.resolve();
      case StoredShapeData.State.QUEUED_WRITE:
        loadingElementFinished(writeWaiterId);
        return this.update();
      case StoredShapeData.State.SAVED:
        console.error('Unexpected feature state:' + this);
        return null;
    }
  }

  /**
   * Deletes our feature from storage and userRegionData. Only for internal use
   * (would be "private" in Java).
   * @return {Promise} Promise that completes when deletion is complete.
   */
  delete() {
    // Feature has been removed from map, we should delete on backend.
    userRegionData.delete(this.popup.mapFeature);
    if (!this.id) {
      // Even if the user creates a feature and then deletes it immediately,
      // the creation should trigger an update that must complete before the
      // deletion gets here. So there should always be an id.
      console.error('Unexpected: feature to be deleted had no id: ', this);
      return Promise.resolve();
    }
    // Nothing more needs to be done for this element because it is
    // unreachable and about to be GC'ed.
    return userShapes.doc(this.id)
        .delete()
        .then(() => this.noteWriteFinished())
        .catch(createError('error deleting ' + this));
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

// Tracks global pending writes so that we can warn if user leaves page early.
StoredShapeData.pendingWriteCount = 0;

StoredShapeData.featureGeoPoints = (feature) => isMarker(feature) ?
    [latLngToGeoPoint(feature.getPosition())] :
    pathToGeoPointArray(feature);

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
  return damageAsset ?
      ee.FeatureCollection(damageAsset).filterBounds(polygon).size() :
      ee.String('unknown');
};

StoredShapeData.getIntersectingBlockGroups = (polygon) => {
  return ee.FeatureCollection(getScoreAsset())
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

const collectionName = 'usershapes';

let userShapes = null;

const appearance = {
  fillColor: '#4CEF64',
  strokeColor: '#4CEF64',
  editable: false,
};

/**
 * Create a Google Maps Drawing Manager for drawing polygons and markers.
 *
 * @param {google.maps.Map} map
 * @param {Promise<any>} firebasePromise Promise that will complete when
 *     Firebase authentication is finished
 * @return {Promise} Promise that contains DrawingManager when complete
 */
function setUpPolygonDrawing(map, firebasePromise) {
  setUpPopup();

  return firebasePromise.then(() => {
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
    return drawingManager;
  });
}

/**
 * Retrieves user-defined regions from Firestore and displays them on given map.
 * Adds a listener to display notes on pop-up. Stores EE path for damage asset.
 *
 * @param {google.maps.Map} map Map to display regions on
 * @param {Promise<any>} firebasePromise Promise with Firebase damage data (also
 *     implies that authentication is complete)
 * @return {Promise} promise that is resolved when all initialization is done
 *     (only used by tests)
 */
function initializeAndProcessUserRegions(map, firebasePromise) {
  addLoadingElement(mapContainerId);
  return firebasePromise
      .then((doc) => {
        // Damage asset may not exist yet, so this is undefined. We tolerate
        // gracefully.
        damageAsset = doc.data()['asset_data']['damage_asset_path'];
        userShapes = getFirestoreRoot().collection(collectionName);
      })
      .then(() => userShapes.get())
      .then(
          (querySnapshot) => drawRegionsFromFirestoreQuery(querySnapshot, map))
      .catch(createError('getting user-drawn regions'));
}

// TODO(janakr): it would be nice to unit-test this, but I don't know how to get
// the google maps Polygon objects, and mocking them defeats the purpose.
/**
 * Helper function that actually does drawing on map when Firestore query
 * completes.
 *
 * @param {firebase.firestore.QuerySnapshot} querySnapshot result of query
 * @param {google.maps.Map} map Map to display regions on
 */
function drawRegionsFromFirestoreQuery(querySnapshot, map) {
  querySnapshot.forEach((userDefinedRegion) => {
    const storedGeometry = userDefinedRegion.get('geometry');
    const coordinates = transformGeoPointArrayToLatLng(storedGeometry);
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
      calculatedData = userDefinedRegion.get('calculatedData');
    }
    const notes = userDefinedRegion.get('notes');
    const popup = createPopup(feature, map, notes, calculatedData);
    userRegionData.set(
        feature,
        new StoredShapeData(
            userDefinedRegion.id, notes, storedGeometry, popup));
    feature.setMap(map);
  });
  loadingElementFinished(mapContainerId);
}

/**
 * Rounds the given number to one decimal place.
 * @param {number} number
 * @return {number}
 */
function roundToOneDecimal(number) {
  return Math.round(10 * number) / 10;
}
