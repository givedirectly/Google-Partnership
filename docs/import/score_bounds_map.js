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
   * @param {HTMLDivElement} div to attach map to
   * @param {Function} saveData Called on changes to polygon with the path of
   *     the polygon (as an `Array<LatLng>` object)
   */
  constructor(div, saveData) {
    this.polygon = null;
    this.saveData = () =>
        saveData(this.polygon ? this.polygon.getPath().getArray() : null);
    /** @const */
    this.map = createBasicMap(div, {streetViewControl: false}).map;
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
    this.deleteButton = $(document.createElement('button'))
                            .addClass('score-bounds-delete-button')
                            .text('Delete')
                            .on('click',
                                () => {
                                  if (confirm('Delete existing bounds?')) {
                                    this._removePolygon();
                                    this.saveData();
                                  }
                                })
                            .hide();
    this.map.controls[google.maps.ControlPosition.TOP_LEFT].insertAt(
        0, this.deleteButton[0]);
  }

  /**
   * Removes the currently drawn polygon from the map, and sets the map up to
   * draw a new polygon. Does not call {@link this.saveData}.
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
    this.needsBoundsFit = true;
    if (polygonCoordinates) {
      this._addPolygon(new google.maps.Polygon(
          this._createPolygonOptions(polygonCoordinates)));
    }
  }

  /**
   * Called whenever the map becomes visible. Sets the bounds of the map if they
   * have not yet been set for the current data. Bounds cannot be set earlier
   * because {@link google.maps.Map} does not like having its bounds set when it
   * is not visible.
   */
  onShow() {
    if (!this.needsBoundsFit) {
      return;
    }
    this.needsBoundsFit = false;
    if (this.polygon) {
      // Fit map around existing polygon.
      const bounds = new google.maps.LatLngBounds();
      this.polygon.getPath().forEach((latlng) => bounds.extend(latlng));
      applyMinimumBounds(bounds, this.map);
    } else {
      // TODO(janakr): center around states for disaster.
      this.map.setCenter(defaultMapCenter);
      this.map.setZoom(defaultZoomLevel);
    }
  }

  /**
   * Creates a {@link google.maps.PolygonOptions} object with the given path, so
   * that the polygon is editable and draggable.
   * @param {Array<LatLngLiteral>} polygonCoordinates
   * @return {google.maps.PolygonOptions}
   * @private
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
 * shape changes (dragging a corner, dragging the middle of an edge point) are
 * handled by the listeners registered by {@link
 * ScoreBoundsMap._addListenersToPolygon}, while moving the whole polygon (via
 * clicking the center and dragging it) are handled separately. Since such drags
 * generate so many individual change events, we remove those events on drag
 * start and add them back on drag end.
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
    listeners.push(...ScoreBoundsMap._addListenersToPolygon(polygon, callback));
    callback();
  });
  polygon.removeAllChangeListeners = () => {
    listeners.forEach((listener) => google.maps.event.removeListener(listener));
    listeners.length = 0;
  };
  polygon.addListener('dragstart', () => polygon.removeAllChangeListeners());
};

/**
 * Polygon path event types:
 * - insert_at: drag the middle of an edge, to create a new corner
 * - remove_at: undo an insert_at
 * - set_at: move a corner
 * @type {ReadonlyArray<string>}
 */
const polygonPathEventTypes =
    Object.freeze(['insert_at', 'remove_at', 'set_at']);

/**
 * Adds listeners to the polygon's {@link
 * google.maps.MVCArray<google.maps.LatLng>} path so that any change is
 * detected. These listeners will fire continuously on whole-polygon drag
 * events, so they should be removed before a drag starts. See
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
