import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getDisaster, getResources} from '../resources.js';
import SettablePromise from '../settable_promise.js';
import createError from '../create_error.js';

//TODO: change this all to be 'layer' naming convention

function initializeAsset(firebaseAuthPromise) {
  firebaseAuthPromise
      .then(() => {
        return firebase.firestore()
            .collection('disaster-metadata')
            .doc(getResources().year)
            .collection(getDisaster())
            .doc('layers')
            .get();
      })
      .then((data) => {populateForm(data.data())});
}

function populateForm(data) {
  const assetBody = document.getElementById('asset-table-body');
  for (let key in data) {
    const values = [];
    values.push(data[key]['index']);
    values.push(data[key]['display-name']);
    values.push(new String(data[key]['asset-type']));
    values.push(key);

    const colorFunction = data[key]['color-function'];
    if (!colorFunction) {
      values.push('N/A');
    }
    else if (colorFunction['single-color']) {
      values.push(colorFunction['single-color']);
    } else if (colorFunction['base-color']) {
      values.push(colorFunction['single-color']);
    } else {
      // Add logic to display multiple colors here
      values.push('Temp');
    }
    

    const row = document.createElement('tr');
    for (let i= 0; i < values.length; i++) {
      const cell = document.createElement('td');

      cell.innerHTML = values[i];
      row.appendChild(cell);
    }
    assetBody.appendChild(row);

  }
  $('#asset-table-body').sortable();
  $('#asset-table').Tabledit({
    columns: {
      identifier: [[3, 'assetpath'], [4, 'color']],
      editable: [[0, 'index'], [1, 'displayname'], [2, 'assettype', '{"1": "FeatureCollection", "2": "Image", "3": "ImageCollection"}']],
    },
    restoreButton: false,
});
}

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, we do the work.
 */
function
setup() {
  $(document).ready(function() {
    const firebaseAuthPromise = new SettablePromise();
    const runOnInitialize = () =>
        initializeAsset(firebaseAuthPromise.getPromise());
    const authenticator = new Authenticator(
        (token) =>
            firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
        runOnInitialize);
    authenticator.start();
  });
}

setup();