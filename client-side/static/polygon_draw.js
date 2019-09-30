import {mapContainerId} from './dom_constants.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';

export {processUserRegions, setUpPolygonDrawing as default};

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

const appearance = {
  fillColor: '#FF0000',
  strokeColor: '#FF0000',
  editable: false,
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

  // TODO(#18): persist drawn polygon to backend.
  drawingManager.addListener(
      'overlaycomplete', (event) => addPopUpListener(event.overlay, '', map));

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
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  db.collection('usershapes')
      .get()
      .then(
          (querySnapshot) => drawRegionsFromFirestoreQuery(querySnapshot, map));
}

// TODO(#18): pop notes up as editable field, save modified notes
// to backend. Also save new bounds of polygon to backend.
/**
 * Adds an onclick listener to polygon, popping up the given notes.
 *
 * @param {google.maps.Polygon} polygon Polygon to add listener to
 * @param {String} notes Notes for this polygon
 * @param {google.maps.Map} map Map that polygon will be/is attached to
 */
function addPopUpListener(polygon, notes, map) {
  const listener = polygon.addListener('click', () => {
    // Remove the listener so that duplicate windows don't pop up on another
    // click, and the cursor doesn't become a "clicking hand" over this shape.
    google.maps.event.removeListener(listener);
    const infoWindow = new google.maps.InfoWindow();
    infoWindow.setContent(createInfoWindowHtml(polygon, notes, infoWindow));

    // TODO(janakr): is there a better place to pop this window up?
    const popupCoords = polygon.getPath().getAt(0);
    infoWindow.setPosition(popupCoords);
    infoWindow.addListener(
        // Reinstall the pop-up listener when the window is closed.
        'closeclick', () => {
          addPopUpListener(polygon, notes, map);
          // If we closed while editing, autosave
          // TODO: actually autosave the text when we actually save edited text
          // back to firestore.
          save(polygon, infoWindow, '');
        });
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
  const notesDiv = document.createElement('div');
  notesDiv.innerText = notes;

  const deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'delete';
  deleteButton.id = 'delete';
  deleteButton.onclick = () => {
    if (confirm('Delete region?')) {
      polygon.setMap(null);
      infoWindow.close();
    }
  };
  const editButton = document.createElement('button');
  editButton.innerHTML = 'edit';
  editButton.id = 'edit';
  editButton.onclick = () => {
    polygon.setEditable(true);

    const currentNotes = notesDiv.innerText;

    outerDiv.removeChild(notesDiv);
    outerDiv.removeChild(editButton);

    const notesForm = document.createElement('textarea');
    notesForm.id = 'notes';
    notesForm.value = currentNotes;

    const saveButton = document.createElement('button');
    saveButton.innerHTML = 'save';
    saveButton.id = 'save';
    saveButton.onclick = () => save(polygon, infoWindow, notesForm.value);

    outerDiv.appendChild(saveButton);
    outerDiv.appendChild(document.createElement('br'));
    outerDiv.appendChild(notesForm);
  };

  outerDiv.appendChild(deleteButton);
  outerDiv.appendChild(editButton);
  outerDiv.appendChild(notesDiv);
  return outerDiv;
}

/**
 * Sets given polygon's notes and makes it uneditable.
 *
 * @param {google.maps.Polygon} polygon
 * @param {google.maps.InfoWindow} infoWindow
 * @param {String} notes
 */
function save(polygon, infoWindow, notes) {
  polygon.setEditable(false);
  infoWindow.setContent(createInfoWindowHtml(polygon, notes, infoWindow));
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
    addPopUpListener(polygon, userDefinedRegion.get('notes'), map);
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
