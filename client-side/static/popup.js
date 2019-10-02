import {userRegionData} from './user_region_data.js';

export {addPopUpListener, createPopup, setUpPopup};

let CustomPopup = null;

// Mostly copied from example at
// https://developers-dot-devsite-v2-prod.appspot.com/maps \
//     /documentation/javascript/examples/overlay-popup
/**
 * Sets up the Popup class. See link above for more context.
 */
function setUpPopup() {
  /**
   * A customized popup on the map.
   *
   * @param {google.maps.Polygon} polygon
   * @param {string} notes
   * @param {google.maps.Map} map
   * @constructor
   */
  function Popup(polygon, notes, map) {
    this.polygon = polygon;
    // TODO(janakr): is there a better place to pop this window up?
    this.position = polygon.getPath().getAt(0);
    this.notes = notes;
    this.map = map;
    this.content = document.createElement('div');


    this.content.classList.add('popup-bubble');

    // This zero-height div is positioned at the bottom of the bubble.
    const bubbleAnchor = document.createElement('div');
    bubbleAnchor.classList.add('popup-bubble-anchor');
    bubbleAnchor.appendChild(this.content);

    // This zero-height div is positioned at the bottom of the tip.
    this.containerDiv = document.createElement('div');
    this.containerDiv.classList.add('popup-container');
    this.containerDiv.appendChild(bubbleAnchor);

    // Stop clicks, etc., from bubbling up to the map.
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.containerDiv);
  }

  // ES5 magic to extend google.maps.OverlayView.
  Popup.prototype = Object.create(google.maps.OverlayView.prototype);

  /** Called when the popup is added to the map. */
  Popup.prototype.onAdd = function() {
    createPopupHtml(this, this.notes, this.map);
    this.getPanes().floatPane.appendChild(this.containerDiv);
  };

  /** Called when the popup is removed from the map. */
  Popup.prototype.onRemove = function() {
    if (this.containerDiv.parentElement) {
      this.containerDiv.parentElement.removeChild(this.containerDiv);
    }
  };

  /** Called each frame when the popup needs to draw itself. */
  Popup.prototype.draw = function() {
    const divPosition =
        this.getProjection().fromLatLngToDivPixel(this.position);
    this.containerDiv.style.left = divPosition.x + 'px';
    this.containerDiv.style.top = divPosition.y + 'px';
  };

  // Set the visibility to 'hidden' or 'visible'.
  Popup.prototype.hide = function() {
    // The visibility property must be a string enclosed in quotes.
    this.containerDiv.style.visibility = 'hidden';
  };

  Popup.prototype.show = function() {
    this.containerDiv.style.visibility = 'visible';
  };

  Popup.prototype.updatePosition = function() {
    this.position = this.polygon.getPath().getAt(0);
    this.draw();
  };

  CustomPopup = Popup;
}

const editingClass = 'editing';

/**
 * Populates the content div of the popup.
 *
 * @param {Popup} popup
 * @param {string} notes
 * @param {google.maps.Map} map
 */
function createPopupHtml(popup, notes, map) {
  const content = popup.content;
  markSaved(content);

  const notesDiv = document.createElement('div');
  notesDiv.innerText = notes;

  const polygon = popup.polygon;
  const deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'delete';
  deleteButton.onclick = () => {
    if (confirm('Delete region?')) {
      polygon.setMap(null);
      popup.setMap(null);
      userRegionData.get(polygon).update(polygon);
    }
  };
  // lazily initialized so we don't do the deep clone unless we actually want to
  // edit the polygon.
  let savedShape = null;
  const editButton = document.createElement('button');
  editButton.innerHTML = 'edit';
  editButton.onclick = () => {
    markEditing(content);
    polygon.setEditable(true);

    const currentNotes = notesDiv.innerText;
    savedShape = clonePolygonPaths(polygon);

    content.removeChild(notesDiv);
    content.removeChild(editButton);

    const notesForm = document.createElement('textarea');
    // This isn't great because we end up with multiple elements with the same
    // id. But since we only rely on it for testing for now, not super pressing.
    // TODO: create this id based on polygon id?
    notesForm.id = 'notes';
    notesForm.value = currentNotes;

    const saveButton = document.createElement('button');
    saveButton.innerHTML = 'save';
    saveButton.onclick = () => save(polygon, popup, notesForm.value, map);

    content.insertBefore(saveButton, closeButton);
    content.appendChild(document.createElement('br'));
    content.appendChild(notesForm);
  };

  const closeButton = document.createElement('button');
  closeButton.innerHTML = 'close';
  closeButton.onclick = () => {
    if (!content.classList.contains(editingClass)) {
      popup.hide();
      addPopUpListener(polygon, popup);
    } else if (confirm('Exit without saving changes? Changes will be lost.')) {
      if (savedShape === null) {
        console.error(
            'unexpected state: no shape state saved before editing polygon');
        return;
      }
      polygon.setMap(null);
      polygon.setPaths(savedShape);
      polygon.setMap(map);
      save(polygon, popup, userRegionData.get(polygon).notes, map);
      popup.hide();
      addPopUpListener(polygon, popup);
    }
  };

  content.appendChild(deleteButton);
  content.appendChild(editButton);
  content.appendChild(closeButton);
  content.appendChild(notesDiv);
}

/**
 * Sets given polygon's notes, makes it uneditable, and saves to backend.
 *
 * @param {google.maps.Polygon} polygon
 * @param {Object} popup
 * @param {String} notes
 * @param {google.maps.Map} map
 */
function save(polygon, popup, notes, map) {
  userRegionData.get(polygon).update(polygon, notes);
  // update where the popup pops up to match any polygon shape changes
  popup.updatePosition();
  polygon.setEditable(false);
  markSaved(popup.content);
  // Remove all current contents of the popup replace with the fresh saved
  // content. This is annoying, but would also be annoying to just replace the
  // entire div because of the styling work that happens upon Popup
  // initialization.
  while (popup.content.firstChild) {
    popup.content.firstChild.remove();
  }
  createPopupHtml(popup, notes, map);
}

/**
 * Mark a div as in editing state
 * @param {Element} div
 */
function markEditing(div) {
  div.classList.add(editingClass);
}

/**
 * Mark a div as in saved state
 * @param {Element} div
 */
function markSaved(div) {
  div.classList.remove(editingClass);
}

/**
 * Make a deep copy of a polygon's shape in the form of Array<Array<LatLng>>
 *   (suitable for being fed into google.maps.Polygon.setPaths(...))
 * @param {google.maps.Polygon} polygon
 * @return {Array<Array<google.maps.LatLng>>}
 */
function clonePolygonPaths(polygon) {
  const currentShape = [];
  polygon.getPaths().forEach(function(array, index) {
    const path = [];
    array.forEach(function(latlng, index) {
      path.push(JSON.parse(JSON.stringify(latlng)));
    });
    currentShape.push(path);
  });
  return currentShape;
}

/**
 * Adds an onclick listener to polygon, popping up the given notes.
 *
 * @param {google.maps.Polygon} polygon Polygon to add listener to
 * @param {Popup} popup
 */
function addPopUpListener(polygon, popup) {
  const listener = polygon.addListener('click', () => {
    // Remove the listener so that duplicate windows don't pop up on another
    // click, and the cursor doesn't become a "clicking hand" over this shape.
    google.maps.event.removeListener(listener);
    popup.show();
  });
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
  const popup =
      new CustomPopup(polygon, userRegionData.get(polygon).notes, map);
  popup.setMap(map);
  popup.hide();
  return popup;
}
