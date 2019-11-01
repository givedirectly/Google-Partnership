import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getDisaster, getResources} from '../resources.js';
import SettablePromise from '../settable_promise.js';

//TODO: get this from the url 
const assetName = 'users/gd/harvey/fema-visits';


function initializeAsset(firebaseAuthPromise) {
	// var urlAssetName = /assetName=([^&]+)/.exec(window.location.href)[1]; 
	if (assetName) {
	 firebaseAuthPromise.then(() => {
		return firebase.firestore()
	                    .collection('disaster-metadata')
	                    .doc(getResources().year)
	                    .collection(getDisaster())
	                    .doc('layers').get();
	                }).then((data) => {populateForm(data.data())});
	}
	document.getElementById('asset-form').form.onsubmit = onAssetFormSubmit;
}

function onAssetFormSubmit() {
	// firebase.firestore()
 //      .collection('disaster-metadata')
 //      .doc(getResources().year)
 //      .collection(disaster)
 //      .doc('layers')
 //      .collection(assetName)
 //      .set(docData)
 //      .catch(
 //          createError('error saving bounds for ' + disaster + ': ' + docData));
	return false;
}

function populateForm(data) {
	const asset = data[assetName];
	document.getElementById('display-on-load-checkbox').checked = asset['display-on-load'];
	document.getElementById('display-name-input').value = asset['display-name'];
	document.getElementById('asset-path-input').value = assetName;

	if (asset['color-fxn']['single-color']) {
		createColorChild('Color', asset['color-fxn']['single-color'])
	} else{
		const colors = asset['color-fxn']['colors'];
		for (var key in colors) {
			createColorChild(key, colors[key])
		}
	}
}

function createColorChild(color, value) {
	const colorsContainer = document.getElementById('display-colors-container');
	const label = document.createElement('label');
	label.innerHTML = color;
	colorsContainer.appendChild(label);

	const input = document.createElement('input');
	input.value = value;
	input.type = 'text';
	colorsContainer.appendChild(input);

	colorsContainer.appendChild(document.createElement('br'));
}

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, we do the work.
 */
function setup() {
  $(document).ready(function() {
    const firebaseAuthPromise = new SettablePromise();
    const runOnInitialize = () => initializeAsset(firebaseAuthPromise.getPromise());
    const authenticator = new Authenticator(
        (token) =>
            firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
        runOnInitialize);
    authenticator.start();
  });
}

setup();