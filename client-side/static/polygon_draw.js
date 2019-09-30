import createError from './create_error.js';
import {mapContainerId} from './dom_constants.js';
import inProduction from './in_test_util.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';

// PolygonData is only for testing.
export {PolygonData, processUserRegions, setUpPolygonDrawing as default};

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
 * Map from Google Maps Polygon to PolygonData, so that on user-region
 * modifications we can track new notes values and write data back to database.
 * Data is added to this map on loading from the backend or on user creation,
 * and removed if the polygon is deleted.
 */
const polygonData = new Map();

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
  // TODO(#18): make editable by choosing polygon and clicking button.
  editable: true,
};

/**
 * Create a Google Maps Drawing Manager for drawing polygons.
 *
 * @param {google.maps.Map} map
 */
function setUpPolygonDrawing(map) {
  const drawingManager = new google.maps.drawing.DrawingManager({
    drawingControl: true,
    drawingControlOptions: {drawingModes: ['marker', 'polygon']},
    polygonOptions: appearance,
  });

  drawingManager.addListener('overlaycomplete', (event) => {
    const polygon = event.overlay;
    const data = new PolygonData(null, '');
    polygonData.set(polygon, data);
    addPopUpListener(polygon, map);
    data.update(polygon, '');
  });

  drawingManager.setMap(map);
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

// TODO(#18): pop notes up as editable field, trigger save on modifications.
// Also trigger save on modifying bounds.
/**
 * Adds an onclick listener to polygon, popping up the given notes.
 *
 * @param {google.maps.Polygon} polygon Polygon to add listener to
 * @param {google.maps.Map} map Map that polygon will be/is attached to
 */
function addPopUpListener(polygon, map) {
  const listener = polygon.addListener('click', () => {
    // Remove the listener so that duplicate windows don't pop up on another
    // click, and the cursor doesn't become a "clicking hand" over this shape.
    google.maps.event.removeListener(listener);
    const infoWindow = new google.maps.InfoWindow();
    infoWindow.setContent(createInfoWindowHtml(
        polygon, polygonData.get(polygon).notes, infoWindow));
    // TODO(janakr): is there a better place to pop this window up?
    const popupCoords = polygon.getPath().getAt(0);
    infoWindow.setPosition(popupCoords);
    // Reinstall the pop-up listener when the window is closed.
    infoWindow.addListener('closeclick', () => addPopUpListener(polygon, map));
    infoWindow.open(map);
  });
}

/**
 * Creates the inner contents of the InfoWindow that pops up when a polygon is
 * selected.
 *
 * @param {google.maps.Polygon} polygon
 * @param {String} notes
 * @param {google.maps.InfoWindow} infoWindow
 * @return {HTMLDivElement}
 */
function createInfoWindowHtml(polygon, notes, infoWindow) {
  const outerDiv = document.createElement('div');
  const button = document.createElement('button');
  button.innerHTML = 'delete';
  button.onclick = () => {
    if (confirm('Delete region?')) {
      polygon.setMap(null);
      infoWindow.close();
      polygonData.get(polygon).update(polygon);
    }
  };
  const notesDiv = document.createElement('div');
  notesDiv.innerText = notes;
  outerDiv.appendChild(button);
  outerDiv.appendChild(notesDiv);
  return outerDiv;
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
    addPopUpListener(polygon, map);
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
