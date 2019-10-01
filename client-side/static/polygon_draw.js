import createError from './create_error.js';
import {mapContainerId} from './dom_constants.js';
import inProduction from './in_test_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {polygonData} from './polygon_data.js';
import {addPopUpListener, setUpPopup} from './popup.js';

// PolygonData is only for testing.
export {
  PolygonData,
  processUserRegions,
  setUpPolygonDrawing as default,
};

// TODO(#13): use proper keys associated to GiveDirectly account,
// and lock down security (right now database is global read-write).
const firebaseConfig = {
  apiKey: 'AIzaSyAbNHe9B0Wo4MV8rm3qEdy8QzFeFWZERHs',
  authDomain: 'givedirectly.firebaseapp.com',
  databaseURL: 'https://givedirectly.firebaseio.com',
  projectId: 'givedirectly',
  storageBucket: '',
  messagingSenderId: '634162034024',
  appId: '1:634162034024:web:c5f5b82327ba72f46d52dd',
};


/**
 * Class holding data for a user-drawn polygon, including the state of writing
 * to the backend. Does not hold the polygon itself.
 */
class PolygonData {
  /**
   * Constructor. The id is null if user has just created polygon (corresponds
   * to backend id).
   *
   * @param {String} id Firestore id.
   * @param {String} notes User-entered notes.
   */
  constructor(id, notes) {
    this.id = id;
    this.notes = notes;
    this.state = PolygonData.State.SAVED;
  }

  /**
   * Writes this polygon's data to the backend, using the existing id field,
   * or adding a new document to Firestore if there is no id. The passed-in
   * notes, if given, override the current notes value.
   *
   * If there is already a pending write, this method records that another write
   * should be performed when the pending one completes and returns immediately.
   *
   * @param {google.maps.Polygon} polygon Polygon to be written to backend.
   * @param {String} notes User-supplied notes (optional).
   */
  update(polygon, notes = this.notes) {
    this.notes = notes;
    if (this.state !== PolygonData.State.SAVED) {
      this.state = PolygonData.State.QUEUED_WRITE;
      return;
    }
    this.state = PolygonData.State.WRITING;
    PolygonData.pendingWriteCount++;
    if (!polygon.getMap()) {
      this.delete(polygon);
      return;
    }
    const geometry = [];
    polygon.getPath().forEach((elt) => geometry.push(latLngToGeoPoint(elt)));
    const record = {geometry: geometry, notes: this.notes};
    const finishWriteAndMaybeWriteAgain = () => {
      PolygonData.pendingWriteCount--;
      const oldState = this.state;
      this.state = PolygonData.State.SAVED;
      switch (oldState) {
        case PolygonData.State.WRITING:
          return;
        case PolygonData.State.QUEUED_WRITE:
          this.update(polygon, this.notes);
          return;
        case PolygonData.State.SAVED:
          console.error('Unexpected polygon state:' + this);
      }
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

  /**
   * Deletes this region from storage and polygonData. Only for internal use.
   *
   * @param {google.maps.Polygon} polygon
   */
  delete(polygon) {
    // Polygon has been removed from map, we should delete on backend.
    polygonData.delete(polygon);
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
        .then(() => PolygonData.pendingWriteCount--)
        .catch(createError('error deleting ' + this));
  }
}

// Inline static variables not supported in Cypress browser.
PolygonData.State = {
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
PolygonData.pendingWriteCount = 0;

// TODO(janakr): should this be initialized somewhere better?
// Warning before leaving the page.
window.onbeforeunload = () => PolygonData.pendingWriteCount > 0 ? true : null;

// TODO(janakr): maybe not best practice to initialize outside of a function?
// But doesn't take much/any time.
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const collectionName = 'usershapes' + (inProduction() ? '' : '-test');

const userShapes = db.collection(collectionName);

const appearance = {
  fillColor: '#FF0000',
  strokeColor: '#FF0000',
  editable: false,
};

// custom popups must be defined after Maps API is loaded.
let Popup = null;

/**
 * Create a Google Maps Drawing Manager for drawing polygons.
 *
 * @param {google.maps.Map} map
 */
function setUpPolygonDrawing(map) {
  Popup = setUpPopup();

  const drawingManager = new google.maps.drawing.DrawingManager({
    drawingControl: true,
    drawingControlOptions: {drawingModes: ['marker', 'polygon']},
    polygonOptions: appearance,
  });

  drawingManager.addListener('overlaycomplete', (event) => {
    const polygon = event.overlay;
    const data = new PolygonData(null, '');
    polygonData.set(polygon, data);
    addPopUpListener(polygon, createPopup(polygon, map));
    data.update(polygon, '');
  });

  drawingManager.setMap(map);
}


/**
 * Creates a new popup object, attaches it to the map and hides it.
 * This is meant to be called once over the lifetime of a polygon. After it's
 * created, logic should use the show/hide methods to handle its visibility.
 *
 * @param {google.maps.Polygon} polygon
 * @param {google.maps.Map} map
 * @return {Popup}
 */
function createPopup(polygon, map) {
  const popup = new Popup(polygon, polygonData.get(polygon).notes);
  popup.setMap(map);
  popup.hide();
  return popup;
}

// TODO(#18): allow toggling visibility of user regions off and on.
/**
 * Retrieves user-defined regions from Firestore and displays them on given map.
 * Adds a listener to display notes on pop-up.
 *
 * @param {google.maps.Map} map Map to display regions on
 */
function processUserRegions(map) {
  addLoadingElement(mapContainerId);
  userShapes.get()
      .then(
          (querySnapshot) => drawRegionsFromFirestoreQuery(querySnapshot, map))
      .catch(createError('error getting user-drawn regions'));
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
    polygonData.set(
        polygon,
        new PolygonData(userDefinedRegion.id, userDefinedRegion.get('notes')));
    addPopUpListener(polygon, createPopup(polygon, map));
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
