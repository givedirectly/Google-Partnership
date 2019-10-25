import {userRegionData} from './user_region_data.js';

export {
  createPopup,
  setUpPopup,
  setUserFeatureVisibility,
    isMarker,
};

let Popup = null;

// Mostly copied from example at
// https://developers-dot-devsite-v2-prod.appspot.com/maps/documentation/javascript/examples/overlay-popup
/**
 * Sets up the Popup class. See link above for more context.
 */
function setUpPopup() {
  Popup = class extends google.maps.OverlayView {
    /**
     * A customized popup on the map.
     *
     * @param {google.maps.Polygon|google.maps.Marker} mapFeature
     * @param {string} notes initial notes
     * @param {Object} calculatedData calculated data (damage, for instance)
     * @param {google.maps.Map} map
     * @constructor
     */
    constructor(mapFeature, notes, calculatedData, map) {
      super();
      this.mapFeature = mapFeature;
      this.position = getPositionForPopup(mapFeature);
      this.notes = notes;
      this.calculatedData = calculatedData;
      this.map = map;
      this.content = document.createElement('div');
      this.content.className = 'popup-content';
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
      this.addPopUpListener();
    }

    /**
     * Sets the calculatedData property of this popup.
     * @param {Object} calculatedData
     */
    setCalculatedData(calculatedData) {
      this.calculatedData = calculatedData;
      this.updateDamageDiv();
    }

    /** Sets the status of calculated data in this popup to "calculating". */
    setPendingCalculation() {
      this.setCalculatedData(SENTINEL_CALCULATING);
    }

    /**
     * Updates this popup's damage child div if it exists to a new damage value.
     */
    updateDamageDiv() {
      if (!this.damageDiv) {
        return;
      }
      const isNumber = isNaN(this.calculatedData.damage);
      this.damageDiv.innerHTML = 'damage count: ' +
          (isNumber ? 'calculating' : this.calculatedData.damage);
      if (isNumber || !this.saved) {
        this.damageDiv.style.color = 'grey';
      } else {
        this.damageDiv.style.color = 'black';
      }
    }

    /**
     * Updates the saved/editing state.
     * @param {boolean} saved
     */
    updateState(saved) {
      if (saved) {
        this.saved = true;
        setMutable(this.mapFeature, false);
        numEdits--;
      } else {
        this.saved = false;
        setMutable(this.mapFeature, true);
        numEdits++;
      }
    }

    /**
     * Creates the content of the popup's content div from scratch in the saved
     * state (i.e. with an edit button).
     *
     */
    createPopupHtml() {
      const content = this.content;
      removeAllChildren(content);

      if (!isMarker(this.mapFeature)) {
        this.damageDiv = document.createElement('div');
        this.damageDiv.classList.add('popup-damage');
        this.updateDamageDiv();
      }

      const notesDiv = document.createElement('div');
      notesDiv.innerText = this.notes;

      const mapFeature = this.mapFeature;
      const deleteButton = document.createElement('button');
      deleteButton.className = 'popup-button';
      deleteButton.innerHTML = 'delete';
      deleteButton.onclick = () => {
        if (confirm('Delete feature?')) {
          mapFeature.setMap(null);
          this.setMap(null);
          allPopups.delete(this);
          userRegionData.get(mapFeature).update();
        }
      };
      const editButton = document.createElement('button');
      editButton.className = 'popup-button';
      editButton.innerHTML = 'edit';
      editButton.onclick = () => {
        this.updateState(false);

        const currentNotes = notesDiv.innerText;

        if (!isMarker(mapFeature)) {
          // Grey out the damage stat until we save so it's clearly old.
          this.damageDiv.style.color = 'grey';
        }
        content.removeChild(notesDiv);
        content.removeChild(editButton);

        const notesForm = document.createElement('textarea');
        notesForm.classList.add('notes');
        notesForm.value = currentNotes;

        const saveButton = document.createElement('button');
        saveButton.className = 'popup-button';
        saveButton.innerHTML = 'save';
        saveButton.onclick = () => this.saveNewData(notesForm.value);

        content.insertBefore(saveButton, closeButton);
        content.appendChild(document.createElement('br'));
        content.appendChild(notesForm);
      };

      const closeButton = document.createElement('button');
      closeButton.className = 'popup-button';
      closeButton.innerHTML = 'close';
      closeButton.onclick = () => {
        if (this.saved) {
          this.closeCleanup();
        } else if (confirm(
                       'Exit without saving changes? Changes will be lost.')) {
          mapFeature.setMap(null);
          revertFeaturePosition(mapFeature);
          mapFeature.setMap(this.map);
          this.savePopup();
          this.closeCleanup();
        }
      };

      content.appendChild(deleteButton);
      content.appendChild(editButton);
      content.appendChild(closeButton);
      if (!isMarker(mapFeature)) {
        content.appendChild(this.damageDiv);
      }
      content.appendChild(notesDiv);
    }

    /**
     * Updates this popup and its feature to their uneditable state appearances.
     */
    savePopup() {
      this.updateState(true);
      this.createPopupHtml();
    }

    /**
     * Processes new feature geometry and notes. popup html gets created twice
     * over the course of this method, once before we have the damage number and
     * once after we receive the damage number.
     * @param {String} notes
     */
    saveNewData(notes) {
      this.notes = notes;
      this.savePopup();
      userRegionData.get(this.mapFeature).update();
      // Update where this popup pops up to match any feature geometry changes.
      this.updatePosition();
    }

    /** Hides popup and adds listener for next click. */
    closeCleanup() {
      this.hide();
      this.addPopUpListener();
    }

    /**
     * Adds an onclick listener to a popup's feature, popping up the given
     * notes.
     */
    addPopUpListener() {
      const listener = this.mapFeature.addListener('click', () => {
        // Remove the listener so that duplicate windows don't pop up on another
        // click, and the cursor doesn't become a "clicking hand" over this
        // shape.
        google.maps.event.removeListener(listener);
        this.show();
      });
    }

    // Below this line are implementations of OverlayView methods.
    /** Called when the popup is added to the map. */
    onAdd() {
      this.createPopupHtml();
      this.getPanes().floatPane.appendChild(this.containerDiv);
    }

    /** Called when the popup is removed from the map. */
    onRemove() {
      if (this.containerDiv.parentElement) {
        this.containerDiv.parentElement.removeChild(this.containerDiv);
      }
    }

    /** Called each frame when the popup needs to draw itself. */
    draw() {
      const divPosition =
          this.getProjection().fromLatLngToDivPixel(this.position);
      this.containerDiv.style.left = divPosition.x + 'px';
      this.containerDiv.style.top = divPosition.y + 'px';
    }

    /** Sets the visibility to 'hidden'. */
    hide() {
      // The visibility property must be a string enclosed in quotes.
      this.containerDiv.style.visibility = 'hidden';
    }

    /** Sets the visibility to 'visible'. */
    show() {
      this.containerDiv.style.visibility = 'visible';
    };

    /** @return {boolean} true if the popup is currently visible. */
    isVisible() {
      return this.containerDiv.style.visibility === 'visible';
    };

    /**
     * Updates the popup's position after its underlying feature has changed.
     */
    updatePosition() {
      this.position = getPositionForPopup(this.mapFeature);
      this.draw();
    };
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
      popup.closeCleanup();
    }
    popup.mapFeature.setVisible(visibility);
  }
  return true;
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
 * Gets position that popup for this feature should go.
 * @param {google.maps.Marker|google.maps.Polygon} mapFeature
 * @return {google.maps.LatLng}
 */
function getPositionForPopup(mapFeature) {
  if (isMarker(mapFeature)) {
    return mapFeature.getPosition();
  }
  // TODO(janakr): is there a better place to pop this window up?
  return mapFeature.getPath().getAt(0);
}

function revertFeaturePosition(mapFeature) {
  const lastFeatureGeometry = userRegionData.get(mapFeature).getLastFeatureGeometry();
  if (isMarker(mapFeature)) {
    mapFeature.setPosition(lastFeatureGeometry);
  } else {
    mapFeature.setPath(lastFeatureGeometry);
  }
}

function setMutable(mapFeature, mutability) {
  if (isMarker(mapFeature)) {
    mapFeature.setDraggable(mutability);
  } else {
    mapFeature.setEditable(mutability);
  }
}

function isMarker(mapFeature) {
  return mapFeature instanceof google.maps.Marker;
}

/**
 * Creates a new popup object, attaches it to the map and hides it.
 * This is meant to be called once over the lifetime of a feature. After it's
 * created, logic should use the show/hide methods to handle its visibility.
 *
 * @param {google.maps.Polygon|google.maps.Marker} feature
 * @param {google.maps.Map} map
 * @param {string} notes
 * @param {Object} calculatedData May be omitted if currently unknown
 * @return {Popup}
 */
function createPopup(
    feature, map, notes, calculatedData = SENTINEL_CALCULATING) {
  const popup = new Popup(feature, notes, calculatedData, map);
  popup.setMap(map);
  popup.hide();
  allPopups.add(popup);
  return popup;
}

const SENTINEL_CALCULATING = {};
