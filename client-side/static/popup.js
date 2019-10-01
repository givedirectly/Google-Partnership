import {addPopUpListener, polygonData} from './polygon_draw.js';

export {setUpPopup as default};

const editingClass = 'editing';

// Mostly copied from example at
// https://developers-dot-devsite-v2-prod.appspot.com/maps \
//     /documentation/javascript/examples/overlay-popup
/**
 *
 * @return {Popup}
 */
function setUpPopup() {
  /**
   * A customized popup on the map.
   *
   * @param {google.maps.Polygon} polygon
   * @param {string} notes
   * @constructor
   */
  function Popup(polygon, notes) {
    this.polygon = polygon;
    this.position = polygon.getPath().getAt(0);
    this.notes = notes;
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

    // Optionally stop clicks, etc., from bubbling up to the map.
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.containerDiv);
  }

  // ES5 magic to extend google.maps.OverlayView.
  Popup.prototype = Object.create(google.maps.OverlayView.prototype);

  /** Called when the popup is added to the map. */
  Popup.prototype.onAdd = function() {
    createPopupHtml(this);
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

    // Hide the popup when it is far out of view.
    const display =
        Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000 ?
        'block' :
        'none';

    if (display === 'block') {
      this.containerDiv.style.left = divPosition.x + 'px';
      this.containerDiv.style.top = divPosition.y + 'px';
    }
    if (this.containerDiv.style.display !== display) {
      this.containerDiv.style.display = display;
    }
  };

  // Set the visibility to 'hidden' or 'visible'.
  Popup.prototype.hide = function() {
    // The visibility property must be a string enclosed in quotes.
    this.containerDiv.style.visibility = 'hidden';
  };

  Popup.prototype.show = function() {
    this.containerDiv.style.visibility = 'visible';
  };

  return Popup;
}

/**
 *
 * @param {Popup} popup
 */
function createPopupHtml(popup) {
  const content = popup.content;
  markSaved(content);

  const notesDiv = document.createElement('div');
  notesDiv.innerText = popup.notes;

  const polygon = popup.polygon;
  const deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'delete';
  deleteButton.onclick = () => {
    if (confirm('Delete region?')) {
      polygon.setMap(null);
      popup.setMap(null);
      polygonData.get(polygon).update(polygon);
    }
  };
  const editButton = document.createElement('button');
  editButton.innerHTML = 'edit';
  editButton.onclick = () => {
    markEditing(content);
    polygon.setEditable(true);

    const currentNotes = notesDiv.innerText;

    content.removeChild(notesDiv);
    content.removeChild(editButton);

    const notesForm = document.createElement('textarea');
    // This isn't great because we end up with multiple divs with the same
    // id. But since we only rely on it for testing for now, not super pressing.
    // TODO: create this id based on polygon id?
    notesForm.id = 'notes';
    notesForm.value = currentNotes;

    const saveButton = document.createElement('button');
    saveButton.innerHTML = 'save';
    saveButton.onclick = () => save(polygon, popup, notesForm.value);

    content.insertBefore(saveButton, closeButton);
    content.appendChild(document.createElement('br'));
    content.appendChild(notesForm);
  };

  const closeButton = document.createElement('button');
  closeButton.innerHTML = 'close';
  closeButton.onclick = () => {
    if (!content.classList.contains(editingClass) ||
        confirm('Exit without saving? Unsaved notes will be lost.')) {
      save(polygon, popup, polygonData.get(polygon).notes);
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
 */
function save(polygon, popup, notes) {
  polygonData.get(polygon).update(polygon, notes);
  polygon.setEditable(false);
  markSaved(popup.content);
  while (popup.content.firstChild) {
    popup.content.firstChild.remove();
  }
  createPopupHtml(polygon, popup, notes, popup.content);
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
