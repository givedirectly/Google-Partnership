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
  ShapeData,
};

/**
 * Class holding data for a user-drawn polygon, including the state of writing
 * to the backend. Does not hold the polygon itself.
 */
class ShapeData {
  /**
   * Constructor. The id is null if user has just created polygon (corresponds
   * to backend id).
   *
   * @param {String} id Firestore id.
   * @param {google.maps.Polygon} polygon
   * @param {String} notes User-entered notes.
   * @param {Integer|String} damage
   */
  constructor(id, polygon, notes, damage) {
    this.id = id;
    this.polygon = polygon;
    this.polygonGeoPoints = ShapeData.polygonGeoPoints(polygon);
    this.notes = notes;
    this.damage = damage;
    this.state = ShapeData.State.SAVED;
  }

  /**
   * Writes this shape's polygon's data to the backend, using the existing id
   * field, or adding a new document to Firestore if there is no id. The
   * passed-in notes, if given, override the current notes value.
   *
   * If there is already a pending write, this method records that another write
   * should be performed when the pending one completes and returns immediately.
   *
   * @param {Function} damageReceiver
   * @param {String} notes User-supplied notes (optional).
   */
  update(damageReceiver = () => {}, notes = this.notes) {
    this.notes = notes;
    if (this.state !== ShapeData.State.SAVED) {
      this.state = ShapeData.State.QUEUED_WRITE;
      return;
    }
    addLoadingElement(writeWaiterId);
    this.state = ShapeData.State.WRITING;
    ShapeData.pendingWriteCount++;
    if (!polygon.getMap()) {
      this.delete(polygon);
      return;
    }
    const updateDamageLambda = () => {
    };
    const newGeometry = ShapeData.polygonGeoPoints(this.polygon);
    const geometriesEqual = ShapeData.compareGeoPointArrays(this.polygonGeoPoints, newGeometry);
    if (geometriesEqual) {
      updateDamageLambda();
      return;
    }
    this.polygonGeoPoints = newGeometry;
    const points = [];
    polygon.getPath().forEach((elt) => points.push(elt.lng(), elt.lat()));
    ee.FeatureCollection(getResources().damage)
        .filterBounds(ee.Geometry.Polygon(points))
        .size()
        .evaluate((damage, failure) => {
          if (failure) {
            createError('error calculating damage' + this)(failure);
          } else {
    ee.FeatureCollection(getResources().damage)
        .filterBounds(ee.Geometry.Polygon(points))
        .size()
        .evaluate((damage, failure) => {
          if (failure) {
            createError('error calculating damage' + this);
          } else {
            this.damage = damage;
            damageReceiver(this.damage);
            const record = {
              geometry: geometry,
              notes: this.notes,
              damage: this.damage,
            };
            if (this.id) {
              userShapes.doc(this.id)
                  .set(record)
                  .then(finishWriteAndMaybeWriteAgain)
                  .catch(createError('error updating ' + this));
            } else {
              userShapes.add(record)
                  .then((docRef) => {
                    this.id = docRef.id;
                    finishWriteAndMaybeWriteAgain();
                  })
                  .catch(createError('error adding ' + this));
            }
          }
        });
    }
  }

  finishWriteAndMaybeWriteAgain(damageReceiver) {
    ShapeData.pendingWriteCount--;
    const oldState = this.state;
    this.state = ShapeData.State.SAVED;
    switch (oldState) {
      case ShapeData.State.WRITING:
        loadingElementFinished(writeWaiterId);
        return;
      case ShapeData.State.QUEUED_WRITE:
        loadingElementFinished(writeWaiterId);
        this.update(damageReceiver, this.notes);
        return;
      case ShapeData.State.SAVED:
        console.error('Unexpected polygon state:' + this);
    }
  }

  doRemoteUpdate(damageReceiver) {
            const record = {
              geometry: this.polygonGeoPoints,
              notes: this.notes,
              damage: this.damage,
            };
            if (this.id) {
              userShapes.doc(this.id)
                  .set(record)
                  .then(() => this.finishWriteAndMaybeWriteAgain(damageReceiver))
                  .catch(createError('error updating ' + this));
            } else {
              userShapes.add(record)
                  .then((docRef) => {
                    this.id = docRef.id;
                    this.finishWriteAndMaybeWriteAgain(damageReceiver);
                  })
                  .catch(createError('error adding ' + this));
            }
          }

  /**
   * Deletes this region from storage and userRegionData. Only for internal use.
   *
   * @param {google.maps.Polygon} polygon
   */
  delete(polygon) {
    // Polygon has been removed from map, we should delete on backend.
    userRegionData.delete(polygon);
    if (!this.id) {
      // Even if the user creates a polygon and then deletes it immediately,
      // the creation should trigger an update that must complete before the
      // deletion gets here. So there should always be an id.
      console.error('Unexpected: polygon to be deleted had no id: ', polygon);
      return;
    }
    // Nothing more needs to be done for this element because it is
    // unreachable and about to be GC'ed.
    userShapes.doc(this.id)
        .delete()
        .then(() => ShapeData.pendingWriteCount--)
        .catch(createError('error deleting ' + this));
  }
}

// Inline static variables not supported in Cypress browser.
ShapeData.State = {
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
ShapeData.pendingWriteCount = 0;

ShapeData.polygonGeoPoints = (polygon) => {
  const geometry = [];
  polygon.getPath().forEach((elt) => geometry.push(latLngToGeoPoint(elt)));
  return geometry;
};

ShapeData.compareGeoPointArrays = (array1, array2) => {
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
window.onbeforeunload = () => ShapeData.pendingWriteCount > 0 ? true : null;

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
      const popup = createPopup(polygon, map);
      const data = new ShapeData(null, polygon, '', 'calculating');
      userRegionData.set(polygon, data);
      data.update((damage) => popup.updateDamage(damage), '');
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
    const coordinates = [];
    storedGeometry.forEach(
        (geopoint) => coordinates.push(geoPointToLatLng(geopoint)));
    const properties = Object.assign({}, appearance);
    properties.paths = coordinates;
    const polygon = new google.maps.Polygon(properties);
    const popup = createPopup(polygon, map);
    userRegionData.set(
        polygon,
    new ShapeData(userDefinedRegion.id, null, userDefinedRegion.get(
        'notes'), userDefinedRegion.get('damage')));
    polygon.setMap(map);
  });
  loadingElementFinished(mapContainerId);
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
