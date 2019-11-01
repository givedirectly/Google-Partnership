import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {blockGroupTag, buildingCountTag, damageTag, geoidTag, incomeTag, snapPercentageTag, snapPopTag, sviTag, totalPopTag, tractTag} from '../property_names.js';
import {getDisaster, getResources} from '../resources.js';
import SettablePromise from '../settable_promise.js';

//TODO: get this from the url 
const assetName = 'users/gd/harvey/FEMA_Damage_Assessments';


function initializeAsset(firebaseAuthPromise) {
	// var urlAssetName = /assetName=([^&]+)/.exec(url)[1]; 
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