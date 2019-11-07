import {getFirestoreRoot} from './authenticate.js';
import {mapContainerId, writeWaiterId} from './dom_constants.js';
import {createError} from './error.js';
import {addLoadingElement, loadingElementFinished} from './loading.js';
import {geoPointToLatLng, latLngToGeoPoint} from './map_util.js';
import {createPopup, isMarker, setUpPopup} from './popup.js';
import {getResources} from './resources.js';
import {userRegionData} from './user_region_data.js';

// ShapeData is only for testing.
export {
  displayCalculatedData,
  processUserRegions,
  setUpPolygonDrawing as default,
  StoredShapeData,
};

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

  /**
   * Writes this shape's data to the backend, using the existing id
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
    const feature = this.popup.mapFeature;
    addLoadingElement(writeWaiterId);
    this.state = StoredShapeData.State.WRITING;
    StoredShapeData.pendingWriteCount++;
    if (!feature.getMap()) {
      this.delete();
      return;
    }
    const newGeometry = StoredShapeData.featureGeoPoints(feature);
    const geometriesEqual = StoredShapeData.compareGeoPointArrays(
        this.featureGeoPoints, newGeometry);
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
    this.featureGeoPoints = newGeometry;
    if (isMarker(feature)) {
      // No calculated data for a marker.
      this.doRemoteUpdate();
      return;
    }
    this.popup.setPendingCalculation();

    const points = [];
    feature.getPath().forEach((elt) => points.push(elt.lng(), elt.lat()));
    const polygon = ee.Geometry.Polygon(points);
    const numDamagePoints = StoredShapeData.prepareDamageCalculation(polygon);
    const intersectingBlockGroups =
        StoredShapeData.getIntersectingBlockGroups(polygon);
    const weightedSnapHouseholds = StoredShapeData.calculateWeightedTotal(
        intersectingBlockGroups, 'SNAP HOUSEHOLDS');
    const weightedTotalHouseholds = StoredShapeData.calculateWeightedTotal(
        intersectingBlockGroups, 'TOTAL HOUSEHOLDS');
    ee.List([
        numDamagePoints, weightedSnapHouseholds, weightedTotalHouseholds,
      ]).evaluate((list, failure) => {
      if (failure) {
        createError('error calculating damage' + this)(failure);
        return;
      }
      const calculatedData = {
        damage: list[0],
        snapFraction: list[2] > 0 ? (list[1] / list[2]).toFixed(1) : 0,
      };
      this.popup.setCalculatedData(calculatedData);
      this.doRemoteUpdate();
    });
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

  /** Kicks off Firestore remote write. */
  doRemoteUpdate() {
    const record = {
      geometry: this.featureGeoPoints,
      notes: this.popup.notes,
      calculatedData: this.popup.calculatedData,
    };
    if (this.id) {
      userShapes.doc(this.id)
          .set(record)
          .then(() => this.finishWriteAndMaybeWriteAgain())
          .catch(createError('error updating ' + this));
    } else {
      userShapes.add(record)
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
        console.error('Unexpected feature state:' + this);
    }
  }

  /**
   * Deletes our feature from storage and userRegionData. Only for internal use
   * (would be "private" in Java).
   */
  delete() {
    // Feature has been removed from map, we should delete on backend.
    userRegionData.delete(this.popup.mapFeature);
    if (!this.id) {
      // Even if the user creates a feature and then deletes it immediately,
      // the creation should trigger an update that must complete before the
      // deletion gets here. So there should always be an id.
      console.error('Unexpected: feature to be deleted had no id: ', this);
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

StoredShapeData.featureGeoPoints = (feature) => {
  const geometry = [];
  StoredShapeData.featureLatLng(feature).forEach(
      (elt) => geometry.push(latLngToGeoPoint(elt)));
  return geometry;
};

StoredShapeData.featureLatLng = (feature) => {
  return isMarker(feature) ? [feature.getPosition()] : feature.getPath();
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

StoredShapeData.prepareDamageCalculation = (polygon) => {
  return ee.FeatureCollection(getResources().damage)
      .filterBounds(polygon)
      .size();
};

StoredShapeData.getIntersectingBlockGroups = (polygon) => {
  return ee.FeatureCollection(getResources().getCombinedAsset())
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
  const damageDiv = document.createElement('div');
  damageDiv.innerHTML = 'damage count: ' + calculatedData.damage;
  const snapDiv = document.createElement('div');
  snapDiv.innerHTML =
      'Approximate snap fraction: ' + calculatedData.snapFraction;
  parentDiv.appendChild(damageDiv);
  parentDiv.appendChild(snapDiv);
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
  });
}

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
      .then(() => userShapes = getFirestoreRoot().collection(collectionName))
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
 * Transforms GeoPoint array to LatLng array.
 * @param {Array<firebase.firestore.GeoPoint>} geopoints
 * @return {Array<LatLng>} Array is actually just lat-lng pairs, but good enough
 */
function transformGeoPointArrayToLatLng(geopoints) {
  const coordinates = [];
  geopoints.forEach((geopoint) => coordinates.push(geoPointToLatLng(geopoint)));
  return coordinates;
}
