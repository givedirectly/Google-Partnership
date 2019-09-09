export {processUserRegions, setUpPolygonDrawing as default};

// TODO(#13): use proper keys associated to GiveDirectly account,
// and lock down security (right now database is global read-write).
const firebaseConfig = {
  apiKey: "AIzaSyAbNHe9B0Wo4MV8rm3qEdy8QzFeFWZERHs",
  authDomain: "givedirectly.firebaseapp.com",
  databaseURL: "https://givedirectly.firebaseio.com",
  projectId: "givedirectly",
  storageBucket: "",
  messagingSenderId: "634162034024",
  appId: "1:634162034024:web:c5f5b82327ba72f46d52dd"
};

const appearance = {
  fillColor: '#FF0000',
  strokeColor: '#FF0000',
  // TODO(#13): make editable by choosing polygon and clicking button.
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
    drawingControlOptions: {
      drawingModes: ['marker', 'polygon']
    },
    polygonOptions: appearance,
  });

  // TODO(#18): persist drawn polygon to backend.
  google.maps.event.addListener(drawingManager, 'overlaycomplete',
      (event) => addListener(event.overlay, 'no notes yet', map)
      );

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
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  db.collection('usershapes').get().then((querySnapshot) => drawRegionsFromFirebaseQuery(querySnapshot, map));
}

/**
 * Adds an onclick listener to polygon, popping up the given notes.
 *
 * @param polygon {google.maps.Polygon}
 * @param notes {String} notes for this polygon.
 * @param map {google.maps.Map} map that polygon will be/is attached to.
 */
// TODO(#18): pop notes up as editable field, save modified notes
// to backend. Also save new bounds of polygon to backend.
function addListener(polygon, notes, map) {
  console.log(polygon);
  polygon.addListener('click', (event) => {
    const infoWindow = new google.maps.InfoWindow();
    infoWindow.setContent(notes);
    // TODO(janakr): is there a better place to pop this window up?
    const popupCoords = polygon.getPath().getAt(0);
    infoWindow.setPosition(popupCoords);
    infoWindow.open(map);
  });
}

// TODO(janakr): it would be nice to unit-test this, but I don't know how to get
// the google maps Polygon objects, and mocking them defeats the purpose.
/**
 * Helper function that actually does drawing on map when Firestore query
 * completes.
 *
 * @param querySnapshot {firebase.firestore.QuerySnapshot} result of query
 * @param {google.maps.Map} map Map to display regions on
 */
function drawRegionsFromFirebaseQuery(querySnapshot, map) {
  querySnapshot.forEach((doc) => {
    const storedGeometry = doc.get('geometry');
    const coordinates = [];
    storedGeometry.forEach((geopoint) => coordinates.push(geoPointToLatLng(geopoint)));
    const properties = Object.assign({}, appearance);
    properties.paths = coordinates;
    const polygon = new google.maps.Polygon(properties);
    addListener(polygon, doc.get('notes'), map);
    polygon.setMap(map);
  });
}

function geoPointToLatLng(geopoint) {
  return {lat: geopoint.latitude, lng: geopoint.longitude};
}
