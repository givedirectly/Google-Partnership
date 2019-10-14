export {onStartupTaskCompleted as default};
// https://github.com/joepin/google-cloud-storage/blob/master/public/index.html
// TODO(#13): use proper keys associated to GiveDirectly account,
// and lock down security (right now database is global read-write).
const firebaseConfig = {
  apiKey: 'AIzaSyAbNHe9B0Wo4MV8rm3qEdy8QzFeFWZERHs',
  authDomain: 'givedirectly.firebaseapp.com',
  databaseURL: 'https://givedirectly.firebaseio.com',
  projectId: 'givedirectly',
  storageBucket: '',
  messagingSenderId: '634162034024',
  appId: '1:634162034024:web:c5f5b82327ba72f46d52dd',
};

const earthEngineAssetBase = 'users/janak/';
const earthEnginePrefix = 'projects/earthengine-legacy/assets/' + earthEngineAssetBase;

// The client ID from the Google Developers Console.
// TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
// eslint-disable-next-line no-unused-vars
const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
    '.apps.googleusercontent.com';
const BUCKET = 'givedirectly.appspot.com';
const BASE_UPLOAD_URL = `https://www.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;
const BASE_LISTING_URL = `https://www.googleapis.com/storage/v1/b/${BUCKET}/o`;
const storageScope = 'https://www.googleapis.com/auth/devstorage.read_write';
const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope(storageScope);

const mostOfUrl = BASE_UPLOAD_URL + '?' + encodeURIComponent('uploadType=media') + '&name=';

const resultDiv = document.getElementById('results');


// 3 tasks: EE authentication, Firebase authentication, and page load.
let tasksToComplete = 3;

function onStartupTaskCompleted() {
  if (--tasksToComplete === 0) {
    enableWhenReady();
  }
}

let gcsHeader = null;
firebase.initializeApp(firebaseConfig);
firebase.auth().signInWithPopup(provider).then((result) => {
  gcsHeader = new Headers({
    'Authorization': 'Bearer ' + result.credential.accessToken,
  });
  onStartupTaskCompleted();
}).catch((err) => resultDiv.innerHTML = 'Error authenticating with Firebase: ' + err);

const runOnSuccess = function() {
  // Necessary for listAssets.
  ee.initialize(
      /* opt_baseurl=*/ null, /* opt_tileurl=*/ null, onStartupTaskCompleted,
      () => resultDiv.innerHTML = 'Error initializing EarthEngine');
};

const onImmediateFailed = function() {
  $('.g-sign-in').removeClass('hidden');
  $('.output').text('(Log in to see the result.)');
  $('.g-sign-in .button').click(function() {
    ee.data.authenticateViaPopup(function() {
      // If the login succeeds, hide the login button and run the analysis.
      $('.g-sign-in').addClass('hidden');
      runOnSuccess();
    });
  });
};

// Attempt to authenticate using existing credentials.
ee.data.authenticate(
    CLIENT_ID, runOnSuccess, () => console.error('authenticating'), null,
    onImmediateFailed);

function enableWhenReady() {
  ee.data.setCloudApiEnabled(true);
  document.getElementById('fileButton').disabled = false;
  document.getElementById('urlButton').disabled = false;
  document.getElementById('fileButton').onclick = submitFiles;
  updateStatus();
}

function submitFiles(e) {
  if (!gcsHeader) {
    alert('Not signed in properly');
    return false;
  }
  // prevent form's default submit action.
  e.preventDefault();
  const collectionName = document.getElementById('collectionName').value;
  const gcsListingPromise = listGCSFiles(collectionName)
  const assetPromise = maybeCreateImageCollection(collectionName);
  const listingPromise = assetPromise.then(() => listEEAssetFiles(collectionName));

  Promise.all([gcsListingPromise, listingPromise])
      .then((list) => {
        const gcsItems = list[0];
        const eeItems = list[1];
    const fileStatuses = new Map();
    const gcsPrefixLength = (collectionName + '/').length;
    for (const item of gcsItems) {
      // Paths start with '/'.
      // TODO(janakr): remove wrapping when done.
      fileStatuses.set(replaceEarthEngineIllegalCharacters(item.name.substr(gcsPrefixLength)), Status.GCS_ONLY);
    }
    const eePrefixLength = (earthEngineAssetBase + collectionName + '/').length;
    for (const item of eeItems.assets) {
      const name = item.id.substring(eePrefixLength);
      const oldStatus = fileStatuses.get(name);
      if (oldStatus) {
        fileStatuses.set(name, Status.PRESENT_EVERYWHERE);
      } else {
        fileStatuses.set(name, Status.EE_ONLY);
      }
    }
    return fileStatuses;
  }).then((fileStatuses) => processFiles(collectionName, assetPromise, fileStatuses));
  return false;
}

function processFiles(collectionName, assetPromise, fileStatuses) {
  const files = document.getElementById('file').files;
  foundTopFiles += files.length;
  for (const file of files) {
    const mungedName = replaceEarthEngineIllegalCharacters(file.name);
    const status = fileStatuses.get(mungedName) || Status.NEW;
    switch (status) {
      case Status.NEW:
        uploadFileToGCS(mungedName, file, collectionName, assetPromise, ingestEEAssetFromGCS);
        break;
      case Status.GCS_ONLY:
        alreadyUploadedToGCS++;
        ingestEEAssetFromGCS(BUCKET, collectionName, mungedName);
        break;
      case Status.EE_ONLY:
        alreadyImportedToEE++;
        addFileToDelete(file.name);
        break;
      case Status.PRESENT_EVERYWHERE:
        alreadyPresentEverywhere++;
        deleteGCSFile(collectionName, mungedName, file.name);
        break;
    }
    processedFiles++;
  }
}

function uploadFileToGCS(name, contents, collectionName, assetPromise, callback) {
  uploadingToGCS++;
  // get an encoded file name - either from the name input or from the file itself
  const fileName = encodeURIComponent(collectionName + '/' + name);
  // using the simple media upload as per the spec here:
  // https://cloud.google.com/storage/docs/json_api/v1/how-tos/simple-upload
  const URL = mostOfUrl + fileName;
  // Do the upload.
  // We're naively getting the MIME type from the file extension.
  const gcsPromise = fetch(URL, {
    method: 'POST',
    headers: gcsHeader,
    body: contents,
  })
      .then(r => r.json())
      .then((r) => {uploadedToGCS++; return r;})
      .catch(err => {
        console.log(err);
        resultDiv.innerHTML += '<br>Error uploading ' + name + ': ' + err;
        throw err;
      });
  Promise.all([gcsPromise, assetPromise])
      .then((iter) => callback(iter[0].bucket, collectionName, name))
      .catch(err => {
        console.log(err);
        resultDiv.innerHTML += '<br>Error processing ' + name + ': ' + err;
      });
}

function maybeCreateImageCollection(collectionName) {
  let resolveFunction;
  let rejectFunction;
  const result = new Promise((resolve, reject) => {
    resolveFunction = resolve;
    rejectFunction = reject;
  });
  const assetName = earthEngineAssetBase + collectionName;
  ee.data.getAsset(assetName, (getResult, failure) => {
    if (failure) {
      rejectFunction(failure);
    } else if (!getResult) {
      // TODO(janakr): track if actually created to avoid unnecessary listing?
      ee.data.createAsset({id: assetName, type: 'ImageCollection'}, assetName,
          false, {},
          (createResult, failure) => {
        if (failure) {
          rejectFunction(failure);
        } else {
          ee.data.setAssetAcl(assetName, {all_users_can_read: true},
              (aclResult, failure) => {
            if (failure) {
              rejectFunction(failure);
            } else {
              resolveFunction(undefined);
            }
          })
        }
      });
    } else {
      resolveFunction(undefined);
    }
  });
  return result;
}

function ingestEEAssetFromGCS(gcsBucket, collectionName, name) {
  const id = ee.data.newTaskId()[0];
  const request = {id: earthEnginePrefix + collectionName + '/' + name,
    tilesets: [{sources: [{primaryPath: 'gs://' + gcsBucket + '/' + collectionName + '/' + name}]}]};
  ee.data.startIngestion(id, request, (task) => {
    startedEETask++;
    const uploadId = ('taskId' in task) ? task.taskId: id;
    const tail = ' ' + name + ' to EarthEngine with task id ' + uploadId;
    if (('started' in task) && task.started === 'OK') {
      resultDiv.innerHTML += '<br>Importing' + tail;
    } else {
      resultDiv.innerHTML += '<br>Error importing' + tail;
    }

  });
}

function replaceEarthEngineIllegalCharacters(fileName) {
  return fileName.replace(/[^A-Za-z0-9_/-]/g, '_');
}

let foundTopFiles = 0;
let processedFiles = 0;
let uploadingToGCS = 0;
let alreadyUploadedToGCS = 0;
let uploadedToGCS = 0;
let alreadyImportedToEE = 0;
let alreadyPresentEverywhere = 0;
let startedEETask = 0;
let deletedFromGCS = 0;

function updateStatus() {
  document.getElementById('status_div').innerHTML = 'Found ' + foundTopFiles + '<br/>'
  + 'Processed ' + processedFiles + '<br/>'
  + 'Uploading ' + uploadingToGCS + ' files to GCS<br/>'
  + 'Found ' + (alreadyUploadedToGCS + alreadyPresentEverywhere) + ' files previously uploaded to GCS<br/>'
  + 'Uploaded ' + uploadedToGCS + ' files to GCS<br/>'
  + 'Started EE ingestion of ' + startedEETask + ' files<br/>'
  + 'Found ' + (alreadyImportedToEE + alreadyPresentEverywhere) + ' files previously imported to EE<br/>'
  + 'Found ' + alreadyPresentEverywhere + ' files previously imported to EE and present in GCS<br/>'
  + 'Deleted ' + deletedFromGCS + ' files from GCS<br/>';

  setTimeout(updateStatus, 500);
}

const Status = {
  'NEW': 0,
  'GCS_ONLY': 1,
  'EE_ONLY': 2,
  'PRESENT_EVERYWHERE': 3
};

const filesToDelete = [];

function updateCommandDiv() {
  if (!filesToDelete.length) {
    return;
  }
  document.getElementById('command_div').innerText = 'rm ' + filesToDelete.join(' ');
}

function addFileToDelete(file) {
  filesToDelete.push(file);
  updateCommandDiv();
}

function listGCSFiles(collectionName) {
  return listGCSFilesRecursive(collectionName, null, []);
}

function listGCSFilesRecursive(collectionName, nextPageToken, accumulatedList) {
  return fetch(BASE_LISTING_URL + '?prefix=' + encodeURIComponent(collectionName)
       + (nextPageToken ? '&pageToken=' + nextPageToken : ''),
      {
        method: 'GET',
        headers: gcsHeader,
      }).then((r) => r.json())
      .then((resp) => {
        if (accumulatedList) {
          // Avoid push's performance/stack overflow issues for large arrays.
          for (const item of resp.items) {
            accumulatedList.push(item);
          }
        } else {
          accumulatedList = resp.items;
        }
        if (!resp.nextPageToken) {
          return accumulatedList;
        }
        return listGCSFilesRecursive(collectionName, resp.nextPageToken, accumulatedList);
      });
}

function deleteGCSFile(collectionName, name, originalName) {
  if (name.endsWith('_tif')) {
    fetch(BASE_LISTING_URL + '/' + encodeURIComponent(collectionName) + '/'
        + encodeURIComponent(name.replace('_tif', '.tif')), {
      method: 'DELETE',
      headers: gcsHeader,
    });
  }
  return fetch(BASE_LISTING_URL + '/' + encodeURIComponent(collectionName) + '/' + encodeURIComponent(name), {
    method: 'DELETE',
    headers: gcsHeader,
  }).then(() => {
    deletedFromGCS++;
    addFileToDelete(originalName);
  });
}

function listEEAssetFiles(assetName) {
  return ee.data.listAssets(
      earthEnginePrefix
      + assetName, {}, () => {});
}
