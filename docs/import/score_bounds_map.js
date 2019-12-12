import {applyMinimumBounds, createBasicMap, defaultMapCenter, defaultZoomLevel} from '../basic_map.js';

export {ScoreBoundsMap};

/**
 * Helper class to create and attach map for score-bounds selection to the page.
 * We keep a single map (and drawing manager and delete button) across the
 * lifetime of the page. {@link initialize} should be called every time a
 * disaster is loaded to set up the appropriate data.
 *
 * Saves the new polygon coordinates whenever the polygon is edited or deleted.
 */
class ScoreBoundsMap {
  /**
   * @constructor
   * @param {Function} saveData Called on changes to polygon with the path of
   *     the polygon (as an `Array<LatLng>` object).
   */
  constructor(saveData) {
    this.polygon = null;
    this.saveData = () =>
        saveData(this.polygon ? this.polygon.getPath().getArray() : null);
    /** @const */
    this.map = createBasicMap(document.getElementById('score-bounds-map'), {
                 streetViewControl: false,
               }).map;
    /** @const */
    this.drawingManager = new google.maps.drawing.DrawingManager({
      drawingControl: true,
      drawingControlOptions: {drawingModes: ['polygon']},
      polygonOptions: {editable: true, draggable: true},
    });
    this._setUpDeleteButton();
    this.drawingManager.addListener('overlaycomplete', (event) => {
      this._addPolygon(event.overlay);
      this.saveData();
    });
    this.drawingManager.setMap(this.map);
  }

  /** @private Creates {@link this.deleteButton} and attaches it to the map. */
  _setUpDeleteButton() {
    /** @const */
    this.deleteButton = $(document.createElement('button'));
    this.deleteButton.addClass('score-bounds-delete-button');
    this.deleteButton.text('Delete');
    this.deleteButton.on('click', () => {
      if (confirm('Delete existing bounds?')) {
        this._removePolygon();
        this.saveData();
      }
    });
    this.deleteButton.hide();
    this.map.controls[google.maps.ControlPosition.TOP_LEFT].insertAt(
        0, this.deleteButton[0]);
    // document.body.appendChild(this.deleteButton[0]);
  }

  /**
   * Removes the currently drawn polygon from the map, and sets the map up to
   * draw a new polygon. Does not save anything to Firestore.
   * @private
   */
  _removePolygon() {
    this.polygon.setMap(null);
    this.polygon.removeAllChangeListeners();
    this.polygon = null;
    this.drawingManager.setMap(this.map);
    // Without this, reappears in drawing mode, maybe because it didn't
    // gracefully exit last time when map was set to null.
    this.drawingManager.setDrawingMode(null);
    this.deleteButton.hide();
  }

  /**
   * Adds `polygon` to the map. Does not call {@link this.saveData}.
   * @param {google.maps.Polygon} polygon
   * @private
   */
  _addPolygon(polygon) {
    this.polygon = polygon;
    ScoreBoundsMap._callbackOnPolygonChange(
        this.polygon, () => this.saveData());
    this.drawingManager.setMap(null);
    this.deleteButton.show();
  }

  /**
   * Called when the page's disaster is set: Clears the map and draws the given
   * `polygonCoordinates` on the map.
   * @param {?Array<LatLngLiteral>} polygonCoordinates
   */
  initialize(polygonCoordinates) {
    if (this.polygon) {
      this._removePolygon();
    }
    if (polygonCoordinates) {
      this._addPolygon(new google.maps.Polygon(
          this._createPolygonOptions(polygonCoordinates)));
      // Fit map around existing polygon.
      const bounds = new google.maps.LatLngBounds();
      polygonCoordinates.forEach((latlng) => bounds.extend(latlng));
      applyMinimumBounds(bounds, this.map);
    } else {
      this.map.setCenter(defaultMapCenter);
      this.map.setZoom(defaultZoomLevel);
    }
  }

  /**
   * Creates a {@link google.maps.PolygonOptions} object with the given path, so
   * that the polygon is editable and draggable.
   * @param {Array<LatLngLiteral>} polygonCoordinates
   * @return {google.maps.PolygonOptions}
   */
  _createPolygonOptions(polygonCoordinates) {
    return {
      paths: polygonCoordinates,
      map: this.map,
      draggable: true,
      editable: true,
    };
  }
}

/**
 * Sets up `polygon` to call `callback` whenever the polygon changes. Normal
 * shape changes are handled by the listeners registered by {@link
 * addListenersToPolygon}, while drag events are handled separately. Since drag
 * events generate so many individual change events, we remove those events on
 * drag start and add them back on drag end.
 *
 * We also register a `removeAllChangeListeners` method on the polygon so that
 * the caller can easily deregister all listeners if the polygon is being
 * deleted.
 * @param {google.maps.Polygon} polygon
 * @param {Function} callback Function invoked whenever polygon path changes
 */
ScoreBoundsMap._callbackOnPolygonChange = (polygon, callback) => {
  const listeners = ScoreBoundsMap._addListenersToPolygon(polygon, callback);
  polygon.addListener('dragend', () => {
    listeners.push(...addListenersToPolygon(polygon, callback));
    callback();
  });
  polygon.removeAllChangeListeners = () => {
    listeners.forEach((listener) => google.maps.event.removeListener(listener));
    listeners.length = 0;
  };
  polygon.addListener('dragstart', () => polygon.removeAllChangeListeners());
};

const polygonPathEventTypes =
    Object.freeze(['insert_at', 'remove_at', 'set_at']);

/**
 * Adds listeners to the polygon's {@link
 * google.maps.MVCArray<google.maps.LatLng>} path so that any change is
 * detected. These listeners will fire continuously on drag events, so they
 * should be removed before a drag starts. See
 * https://stackoverflow.com/questions/12515748/event-after-modifying-polygon-in-google-maps-api-v3/20682154
 * @param {google.maps.Polygon} polygon
 * @param {Function} callback Called whenever polygon's path changes
 * @return {Array<google.maps.MapsEventListener>} Listeners added
 */
ScoreBoundsMap._addListenersToPolygon = (polygon, callback) => {
  const path = polygon.getPath();
  return polygonPathEventTypes.map(
      (eventType) => google.maps.event.addListener(path, eventType, callback));
};
