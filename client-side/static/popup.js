import {userRegionData} from './user_region_data.js';

export {
  addPopUpListener,
  createPopup,
  setUpPopup,
  setUserFeatureVisibility,
  updateDamage,
};

let Popup = null;

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
   * @param {string} notes initial notes
   * @param {Integer|String} damage initial damage
   * @param {google.maps.Map} map
   * @constructor
   */
  Popup = function(polygon, notes, damage, map) {
    this.polygon = polygon;
    // TODO(janakr): is there a better place to pop this window up?
    this.position = polygon.getPath().getAt(0);
    this.notes = notes;
    this.damage = damage;
    this.map = map;
    this.content = document.createElement('div');
    this.saved = true;

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
  };

  // ES5 magic to extend google.maps.OverlayView.
  Popup.prototype = Object.create(google.maps.OverlayView.prototype);

  /** Called when the popup is added to the map. */
  Popup.prototype.onAdd = function() {
    createPopupHtml(this, this.notes, this.damage);
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

  Popup.prototype.isVisible = function() {
    return this.containerDiv.style.visibility === 'visible';
  };

  Popup.prototype.show = function() {
    this.containerDiv.style.visibility = 'visible';
  };

  Popup.prototype.updatePosition = function() {
    this.position = this.polygon.getPath().getAt(0);
    this.draw();
  };
}

const allPopups = new Set();
let numEdits = 0;

/**
 * Sets the visibility of all current user features. May fail if any features
 * are currently being edited.
 *
 * @param {boolean} visibility If features should be visible or not
 * @return {boolean} if it succeeded
 */
function setUserFeatureVisibility(visibility) {
  if (numEdits > 0) {
    window.alert('Cannot show/hide user features when edits in progress');
    return false;
  }
  for (const popup of allPopups) {
    if (!visibility && popup.isVisible()) {
      closeCleanup(popup);
    }
    popup.polygon.setVisible(visibility);
  }
  return true;
}

/**
 * Given a popup, update its damage child div to a new damage value.
 * @param {Popup} popup
 * @param {Integer|String} damage
 */
function updateDamage(popup, damage) {
  popup.damageDiv.innerHTML = 'damage count: ' + damage;
  if (isNaN(damage) || !popup.saved) {
    popup.damageDiv.style.color = 'grey';
  } else {
    popup.damageDiv.style.color = 'black';
  }
}

/**
 * Update the saved/editing state of a popup.
 * @param {Popup} popup
 * @param {boolean} saved
 */
function updateState(popup, saved) {
  if (saved) {
    popup.saved = true;
    popup.polygon.setEditable(false);
    numEdits--;
  } else {
    popup.saved = false;
    popup.polygon.setEditable(true);
    numEdits++;
  }
}

/**
 * Creates the content of the popup's content div from scratch in the saved
 * state (i.e. with an edit button), saves the given notes and damage to the
 * popup object. Reuses the existing popup object including its content div and
 * polygon.
 *
 * @param {Popup} popup
 * @param {String} notes
 * @param {Integer|String} damage
 */
function createPopupHtml(popup, notes, damage) {
  popup.notes = notes;
  popup.damage = damage;

  const content = popup.content;
  removeAllChildren(content);

  const damageDiv = document.createElement('div');
  damageDiv.classList.add('damage-test-finder');
  popup.damageDiv = damageDiv;
  updateDamage(popup, damage);

  const notesDiv = document.createElement('div');
  notesDiv.innerText = notes;

  const polygon = popup.polygon;
  const deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'delete';
  deleteButton.onclick = () => {
    if (confirm('Delete region?')) {
      polygon.setMap(null);
      popup.setMap(null);
      allPopups.delete(popup);
      userRegionData.get(polygon).update(polygon);
    }
  };
  // lazily initialized so we don't do the deep clone unless we actually want to
  // edit the polygon.
  let savedShape = null;
  const editButton = document.createElement('button');
  editButton.innerHTML = 'edit';
  editButton.onclick = () => {
    updateState(popup, false);

    const currentNotes = notesDiv.innerText;
    savedShape = clonePolygonPath(polygon);

    // Grey out the damage stat until we save so it's clearly old.
    damageDiv.style.color = 'grey';
    content.removeChild(notesDiv);
    content.removeChild(editButton);

    const notesForm = document.createElement('textarea');
    notesForm.classList.add('notes');
    notesForm.value = currentNotes;

    const saveButton = document.createElement('button');
    saveButton.innerHTML = 'save';
    saveButton.onclick = () => saveNewData(popup, notesForm.value);

    content.insertBefore(saveButton, closeButton);
    content.appendChild(document.createElement('br'));
    content.appendChild(notesForm);
  };

  const closeButton = document.createElement('button');
  closeButton.innerHTML = 'close';
  closeButton.onclick = () => {
    if (popup.saved) {
      closeCleanup(popup);
    } else if (confirm('Exit without saving changes? Changes will be lost.')) {
      if (savedShape === null) {
        console.error(
            'unexpected state: no shape state saved before editing polygon');
        return;
      }
      polygon.setMap(null);
      polygon.setPath(savedShape);
      polygon.setMap(popup.map);
      savePopup(popup, notes, damage);
      closeCleanup(popup);
    }
  };

  content.appendChild(deleteButton);
  content.appendChild(editButton);
  content.appendChild(closeButton);
  content.appendChild(damageDiv);
  content.appendChild(notesDiv);
}

/**
 * Utility function to remove all children of a given div.
 * @param {Element} div
 */
function removeAllChildren(div) {
  while (div.firstChild) {
    div.firstChild.remove();
  }
}

/**
 * Updates the popup and polygon to their uneditable state appearances.
 * @param {Object} popup
 * @param {String} notes
 * @param {Integer|String} damage
 */
function savePopup(popup, notes, damage) {
  updateState(popup, true);
  createPopupHtml(popup, notes, damage);
}

/**
 * Process new polygon shape and notes. popup html gets created twice over
 * the course of this method, once before we have the damage number and once
 * after we receive the damage number.
 * @param {Popup} popup
 * @param {String} notes
 */
function saveNewData(popup, notes) {
  savePopup(popup, notes, 'calculating');
  userRegionData.get(popup.polygon)
      .update(popup.polygon, (damage) => updateDamage(popup, damage), notes);
  // update where the popup pops up to match any polygon shape changes
  popup.updatePosition();
}

/**
 * Hides popup and adds listener for next click.
 * @param {Popup} popup
 */
function closeCleanup(popup) {
  popup.hide();
  addPopUpListener(popup);
}

/**
 * Make a deep copy of a polygon's shape in the form of Array<LatLng>
 * (suitable for being fed into google.maps.Polygon.setPath(...)). We only
 * clone a single path because we don't support multi-path polygons right now.
 * @param {google.maps.Polygon} polygon
 * @return {Array<google.maps.LatLng>}
 */
function clonePolygonPath(polygon) {
  const currentShape = [];
  polygon.getPath().forEach((latlng) => currentShape.push(latlng));
  return currentShape;
}

/**
 * Adds an onclick listener to a popup's polygon, popping up the given notes.
 * @param {Popup} popup
 */
function addPopUpListener(popup) {
  const listener = popup.polygon.addListener('click', () => {
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
  const data = userRegionData.get(polygon);
  const popup = new Popup(polygon, data.notes, data.damage, map);
  popup.setMap(map);
  popup.hide();
  allPopups.add(popup);
  return popup;
}
