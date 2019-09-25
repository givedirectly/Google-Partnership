import {mapContainerId} from './dom_constants.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';

export {processUserRegions, setUpPolygonDrawing as default};
import createError from './create_error.js';

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

const polygonData = new Map();

class PolygonData {
  static State = {
    SAVED: 0,
    WRITING: 1,
    QUEUED_WRITE: 2,
  };

  static pendingWriteCount = 0;

  constructor(id, notes) {
    this.id = id;
    this.notes = notes;
    this.state = PolygonData.State.SAVED;
  }

  update(polygon, notes) {
    this.notes = notes;
    if (this.state !== PolygonData.State.SAVED) {
      // Don't do a write, just wait for the last one to finish.
      this.state = PolygonData.State.QUEUED_WRITE;
      return;
    }
    this.state = PolygonData.State.WRITING;
    const geometry = [];
    polygon.getPath().forEach((elt) => {geometry.push(latLngToGeoPoint(elt))});
    const record = {geometry: geometry, notes: this.notes};
    PolygonData.pendingWriteCount++;
    const reduceWriteCountAndMaybeWriteAgain = () => {
      PolygonData.pendingWriteCount--;
      const oldState = this.state;
      this.state = PolygonData.State.SAVED;
      switch (oldState) {
        case PolygonData.State.WRITING:
          return;
        case PolygonData.State.QUEUED_WRITE:
          this.update(polygon, this.notes);
          break;
        case PolygonData.State.SAVED:
          console.error('Unexpected saved state for ' + polygon);
          break;
      }
    };
    if (this.id) {
      userShapes.doc(this.id).set(record).then(reduceWriteCountAndMaybeWriteAgain)
          .catch((error) => {PolygonData.pendingWriteCount--; createError('writing polygon with id ' + this.id)(error)});
    } else {
      userShapes.add(record).then(
          (docRef) => {
            this.id = docRef.id;
            reduceWriteCountAndMaybeWriteAgain();
          }
          )
          .catch((error) => {PolygonData.pendingWriteCount--; createError('writing polygon')(error)});
    }

  }
}

// TODO(janakr): should this be initialized somewhere better?
// Warning before leaving the page.
window.onbeforeunload = () => {return PolygonData.pendingWriteCount > 0 ? true : null};

// TODO(janakr): maybe not best practice to initialize outside of a function?
// But doesn't take much/any time.
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const userShapes = db.collection('usershapes');

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

  drawingManager.addListener(
      'overlaycomplete', (event) => {
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
  userShapes
      .get()
      .then(
          (querySnapshot) => drawRegionsFromFirestoreQuery(querySnapshot, map))
      .catch(createError('Error retrieving user-drawn regions'));
}

function persistToBackEnd(polygon) {
  const data = polygonData.get(polygon);
  const geometry = [];
  polygon.getPath().forEach((elt) => {geometry.push(latLngToGeoPoint(elt))});
  const record = {geometry: geometry, notes: data.notes};
  pendingWriteCount++;
  if (data.id) {
    userShapes.doc(data.id).set(record).then(() => pendingWriteCount--)
        .catch((error) => {pendingWriteCount--; createError('writing polygon with id ' + data.id)(error)});
  } else {
    userShapes.add(record).then(
        (docRef) => {
          data.id = docRef.id;
          pendingWriteCount--;
        }
        )
        .catch((error) => {pendingWriteCount--; createError('writing polygon')(error)});
  }
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
    infoWindow.setContent(polygonData.get(polygon).notes);
    // TODO(janakr): is there a better place to pop this window up?
    const popupCoords = polygon.getPath().getAt(0);
    infoWindow.setPosition(popupCoords);
    // Reinstall the pop-up listener when the window is closed.
    infoWindow.addListener('closeclick', () => addPopUpListener(polygon, map));
    infoWindow.open(map);
  });
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
    polygonData.set(polygon, new PolygonData(userDefinedRegion.id, userDefinedRegion.get('notes')));
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

function latLngToGeoPoint(latLng) {
  return new firebase.firestore.GeoPoint(latLng.lat(), latLng.lng());
}