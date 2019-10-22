import {userRegionData} from './user_region_data.js';

export {
  createPopup,
  setUpPopup,
  setUserFeatureVisibility,
};

let Popup = null;

// Mostly copied from example at
// https://developers-dot-devsite-v2-prod.appspot.com/maps \
//     /documentation/javascript/examples/overlay-popup
/**
 * Sets up the Popup class. See link above for more context.
 */
function setUpPopup() {
  Popup = class extends google.maps.OverlayView {
    /**
     * A customized popup on the map.
     *
     * @param {google.maps.Polygon} polygon
     * @param {string} notes initial notes
     * @param {Integer|String} damage initial damage
     * @param {google.maps.Map} map
     * @constructor
     */
    constructor(polygon, notes, damage, map) {
      super();
      this.polygon = polygon;
      // TODO(janakr): is there a better place to pop this window up?
      this.position = polygon.getPath().getAt(0);
      this.notes = notes;
      this.damage = damage;
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
     * Updates this popup's damage child div to a new damage value.
     * @param {Integer|String} damage
     */
    updateDamage(damage) {
      this.damageDiv.innerHTML = 'damage count: ' + damage;
      if (isNaN(damage) || !this.saved) {
        this.damageDiv.style.color = 'grey';
      } else {
        this.damageDiv.style.color = 'black';
      }
    }

    /**
     * Processes new polygon shape and notes. popup html gets created twice over
     * the course of this method, once before we have the damage number and once
     * after we receive the damage number.
     * @param {String} notes
     */
    saveNewData(notes) {
      this.savePopup(notes, 'calculating');
      userRegionData.get(this.polygon)
          .update(this.polygon, (damage) => this.updateDamage(damage), notes);
      // update where this popup pops up to match any polygon shape changes
      this.updatePosition();
    }

    /**
     * Creates the content of the popup's content div from scratch in the saved
     * state (i.e. with an edit button), saves the given notes and damage to
     * this popup object.
     *
     * @param {String} notes
     * @param {Integer|String} damage
     */
    createPopupHtml(notes, damage) {
      this.notes = notes;
      this.damage = damage;

      const content = this.content;
      removeAllChildren(content);

      const damageDiv = document.createElement('div');
      damageDiv.classList.add('popup-damage');
      this.damageDiv = damageDiv;
      this.updateDamage(damage);

      const notesDiv = document.createElement('div');
      notesDiv.innerText = notes;

      const polygon = this.polygon;
      const deleteButton = document.createElement('button');
      deleteButton.className = 'popup-button';
      deleteButton.innerHTML = 'delete';
      deleteButton.onclick = () => {
        if (confirm('Delete region?')) {
          polygon.setMap(null);
          this.setMap(null);
          allPopups.delete(this);
          userRegionData.get(polygon).update(polygon);
        }
      };
      // lazily initialized so we don't do the deep clone unless we actually
      // want to edit the polygon.
      let savedShape = null;
      const editButton = document.createElement('button');
      editButton.className = 'popup-button';
      editButton.innerHTML = 'edit';
      editButton.onclick = () => {
        this.updateState(false);

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
          if (savedShape === null) {
            console.error(
                'unexpected: no shape state saved before editing polygon');
            return;
          }
          polygon.setMap(null);
          polygon.setPath(savedShape);
          polygon.setMap(this.map);
          this.savePopup(notes, damage);
          this.closeCleanup();
        }
      };

      content.appendChild(deleteButton);
      content.appendChild(editButton);
      content.appendChild(closeButton);
      content.appendChild(damageDiv);
      content.appendChild(notesDiv);
    }

    /**
     * Updates the saved/editing state.
     * @param {boolean} saved
     */
    updateState(saved) {
      if (saved) {
        this.saved = true;
        this.polygon.setEditable(false);
        numEdits--;
      } else {
        this.saved = false;
        this.polygon.setEditable(true);
        numEdits++;
      }
    }

    /**
     * Updates this popup and its polygon to their uneditable state appearances.
     * @param {String} notes
     * @param {Integer|String} damage
     */
    savePopup(notes, damage) {
      this.updateState(true);
      this.createPopupHtml(notes, damage);
    }

    /** Hides popup and adds listener for next click. */
    closeCleanup() {
      this.hide();
      this.addPopUpListener();
    }

    /**
     * Adds an onclick listener to a popup's polygon, popping up the given
     * notes.
     */
    addPopUpListener() {
      const listener = this.polygon.addListener('click', () => {
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
      this.createPopupHtml(this.notes, this.damage);
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
     * Updates the popup's position after its underlying polygon has changed.
     */
    updatePosition() {
      this.position = this.polygon.getPath().getAt(0);
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
    popup.polygon.setVisible(visibility);
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
