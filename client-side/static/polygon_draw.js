import createError from './create_error.js';
import {mapContainerId, writeWaiterId} from './dom_constants.js';
import {getTestCookie, inProduction} from './in_test_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {createPopup, setUpPopup} from './popup.js';
import {getResources} from './resources.js';
import {userRegionData} from './user_region_data.js';

// ShapeData is only for testing.
export {
  processUserRegions,
  setUpPolygonDrawing as default,
  StoredShapeData,
};

/**
 * Class holding data for a user-drawn polygon, including the state of writing
 * to the backend. In contrast with the Popup class, this class corresponds to
 * data that has been written to the backend. However, it keeps a reference to
 * the corresponding Popup object so that it can inform it when data is
 * calculated and retrieve user-modified values.
 */
class StoredShapeData {
  /**
   * @constructor
   *
   * @param {?String} id Firestore id. Null if user has just created polygon
   * @param {?String} notes User-entered notes. Null if user has just created
   *     polygon
   * @param {?Array<firebase.firestore.GeoPoint>} polygonGeoPoints Null if user
   *     has just created polygon
   * @param {Popup} popup
   */
  constructor(id, notes, polygonGeoPoints, popup) {
    this.id = id;
    this.polygonGeoPoints = polygonGeoPoints;
    this.lastNotes = notes;
    /** @const */
    this.popup = popup;
    this.state = StoredShapeData.State.SAVED;
  }

  /**
   * Writes this shape's polygon's data to the backend, using the existing id
   * field, or adding a new document to Firestore if there is no id. New values
   * are retrieved from the popup object.
   *
   * If there is already a pending write, this method records that another write
   * should be performed when the pending one completes and returns immediately.
   */
  update() {
    if (this.state !== StoredShapeData.State.SAVED) {
      this.state = StoredShapeData.State.QUEUED_WRITE;
      return;
    }
    const polygon = this.popup.polygon;
    addLoadingElement(writeWaiterId);
    this.state = StoredShapeData.State.WRITING;
    StoredShapeData.pendingWriteCount++;
    if (!polygon.getMap()) {
      this.delete();
      return;
    }
    const newGeometry = StoredShapeData.polygonGeoPoints(polygon);
    const geometriesEqual = StoredShapeData.compareGeoPointArrays(
        this.polygonGeoPoints, newGeometry);
    const newNotesEqual = this.lastNotes === this.popup.notes;
    this.lastNotes = this.popup.notes;
    if (geometriesEqual) {
      if (!newNotesEqual) {
        this.doRemoteUpdate();
      } else {
        // Because Javascript is single-threaded, during the execution of this
        // method, no additional queued writes can have accumulated. So we don't
        // need to check for them.
        StoredShapeData.pendingWriteCount--;
      }
      return;
    }
    this.popup.setPendingCalculation();

    this.polygonGeoPoints = newGeometry;
    const points = [];
    polygon.getPath().forEach((elt) => points.push(elt.lng(), elt.lat()));
    ee.FeatureCollection(getResources().damage)
        .filterBounds(ee.Geometry.Polygon(points))
        .size()
        .evaluate((damage, failure) => {
          if (failure) {
            createError('error calculating damage' + this)(failure);
            return;
          }
          this.popup.setCalculatedData({damage: damage});
          this.doRemoteUpdate();
        });
  }

  /** @return {Array<LatLng>} saved polygon path, to use when reverting edits */
  getLastPolygonPath() {
    return transformGeoPointArrayToLatLng(this.polygonGeoPoints);
  }

  /**
   * Kicks off Firestore remote write.
   * @return {Promise} Write promise
   */
  doRemoteUpdate() {
    const record = {
      geometry: this.polygonGeoPoints,
      notes: this.popup.notes,
      calculatedData: this.popup.calculatedData,
    };
    if (this.id) {
      return userShapes.doc(this.id)
          .set(record)
          .then(() => this.finishWriteAndMaybeWriteAgain())
          .catch(createError('error updating ' + this));
    } else {
      return userShapes.add(record)
          .then((docRef) => {
            this.id = docRef.id;
            this.finishWriteAndMaybeWriteAgain();
          })
          .catch(createError('error adding ' + this));
    }
  }

  /**
   * After a write completes, checks if there are pending writes and kicks off
   * a new update if so.
   */
  finishWriteAndMaybeWriteAgain() {
    StoredShapeData.pendingWriteCount--;
    const oldState = this.state;
    this.state = StoredShapeData.State.SAVED;
    switch (oldState) {
      case StoredShapeData.State.WRITING:
        loadingElementFinished(writeWaiterId);
        return;
      case StoredShapeData.State.QUEUED_WRITE:
        loadingElementFinished(writeWaiterId);
        this.update();
        return;
      case StoredShapeData.State.SAVED:
        console.error('Unexpected polygon state:' + this);
    }
  }

  /**
   * Deletes this region from storage and userRegionData. Only for internal use.
   */
  delete() {
    // Polygon has been removed from map, we should delete on backend.
    userRegionData.delete(this.popup.polygon);
    if (!this.id) {
      // Even if the user creates a polygon and then deletes it immediately,
      // the creation should trigger an update that must complete before the
      // deletion gets here. So there should always be an id.
      console.error('Unexpected: polygon to be deleted had no id: ', this);
      return;
    }
    // Nothing more needs to be done for this element because it is
    // unreachable and about to be GC'ed.
    userShapes.doc(this.id)
        .delete()
        .then(() => StoredShapeData.pendingWriteCount--)
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

// Tracks global pending writes so that we can warn if user leaves page early.
StoredShapeData.pendingWriteCount = 0;

StoredShapeData.polygonGeoPoints = (polygon) => {
  const geometry = [];
  polygon.getPath().forEach((elt) => geometry.push(latLngToGeoPoint(elt)));
  return geometry;
};

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

// TODO(janakr): should this be initialized somewhere better?
// Warning before leaving the page.
window.onbeforeunload = () =>
    StoredShapeData.pendingWriteCount > 0 ? true : null;

const collectionName =
    'usershapes' + (inProduction() ? '' : ('-test/' + getTestCookie()));

let userShapes = null;

const appearance = {
  fillColor: '#4CEF64',
  strokeColor: '#4CEF64',
  editable: false,
};

/**
 * Create a Google Maps Drawing Manager for drawing polygons.
 *
 * @param {google.maps.Map} map
 * @param {Promise<any>} firebasePromise Promise that will complete when
 *     Firebase authentication is finished
 */
function setUpPolygonDrawing(map, firebasePromise) {
  setUpPopup();

  firebasePromise.then(() => {
    const drawingManager = new google.maps.drawing.DrawingManager({
      drawingControl: true,
      drawingControlOptions: {drawingModes: ['marker', 'polygon']},
      polygonOptions: appearance,
    });

    drawingManager.addListener('overlaycomplete', (event) => {
      const polygon = event.overlay;
      const popup = createPopup(polygon, map, '');
      const data = new StoredShapeData(null, null, null, popup);
      userRegionData.set(polygon, data);
      data.update();
    });

    drawingManager.setMap(map);
  });
}

// TODO(#18): allow toggling visibility of user regions off and on.
/**
 * Retrieves user-defined regions from Firestore and displays them on given map.
 * Adds a listener to display notes on pop-up.
 *
 * @param {google.maps.Map} map Map to display regions on
 * @param {Promise<any>} firebasePromise Promise that will complete when
 *     Firebase authentication is finished
 * @return {Promise} promise that is resolved when all initialization is done
 *     (only used by tests).
 */
function processUserRegions(map, firebasePromise) {
  addLoadingElement(mapContainerId);
  return firebasePromise
      .then(() => userShapes = firebase.firestore().collection(collectionName))
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
    const properties = Object.assign({}, appearance);
    properties.paths = coordinates;
    const polygon = new google.maps.Polygon(properties);
    const notes = userDefinedRegion.get('notes');
    const popup = createPopup(
        polygon, map, notes, userDefinedRegion.get('calculatedData'));
    userRegionData.set(
        polygon,
        new StoredShapeData(
            userDefinedRegion.id, notes, storedGeometry, popup));
    polygon.setMap(map);
  });
  loadingElementFinished(mapContainerId);
}

/**
 * Transforms GeoPoint array to LatLng array.
 * @param {Array<firebase.firestore.GeoPoint>} geopoints
 * @return {Array<LatLng>} Array is actually just lat-lng pairs, but good enough
 */
function transformGeoPointArrayToLatLng(geopoints) {
  const coordinates = [];
  geopoints.forEach((geopoint) => coordinates.push(geoPointToLatLng(geopoint)));
  return coordinates;
}

/**
 * Converts Firestore geopoint into Google Maps LatLng pair.
 *
 * @param {firebase.firestore.GeoPoint} geopoint point to convert
 * @return {Object}
 */
function geoPointToLatLng(geopoint) {
  return {lat: geopoint.latitude, lng: geopoint.longitude};
}

/**
 * Converts Google Maps LatLng object into Firestore geopoint.
 *
 * @param {google.maps.LatLng} latLng
 * @return {firebase.firestore.GeoPoint}
 */
function latLngToGeoPoint(latLng) {
  return new firebase.firestore.GeoPoint(latLng.lat(), latLng.lng());
}
