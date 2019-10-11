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

// The client ID from the Google Developers Console.
// TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
// eslint-disable-next-line no-unused-vars
const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
    '.apps.googleusercontent.com';
const BUCKET = 'givedirectly.appspot.com';
const BASE_URL = `https://www.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;
const storageScope = 'https://www.googleapis.com/auth/devstorage.read_write';
const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope(storageScope);

const mostOfUrl = BASE_URL + '?' + encodeURIComponent('uploadType=media') + '&name=';

const resultDiv = document.getElementById('results');

let accessToken = null;
firebase.initializeApp(firebaseConfig);
firebase.auth().signInWithPopup(provider).then((result) => accessToken = result.credential.accessToken);

const runOnSuccess = function() {
  ee.initialize(
      /* opt_baseurl=*/ null, /* opt_tileurl=*/ null, onStartupTaskCompleted,
      () => resultDiv.innerHTML = 'Error initializing EarthEngine');
};

// Shows a button prompting the user to log in.
// eslint-disable-next-line no-unused-vars
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

// 2 tasks: EE authentication and page load.
let tasksToComplete = 2;

function onStartupTaskCompleted() {
  if (--tasksToComplete === 0) {
    enableWhenReady();
  }
}

// Attempt to authenticate using existing credentials.
ee.data.authenticate(
    CLIENT_ID, runOnSuccess, () => console.error('authenticating'), null,
    onImmediateFailed);

function enableWhenReady() {
  document.getElementById('fileButton').disabled = false;
  document.getElementById('urlButton').disabled = false;
  document.getElementById('fileButton').onclick = submitFiles;
  document.getElementById('urlButton').onclick = submitUrls;
}

function submitFiles(e) {
  if (!accessToken) {
    alert('Not signed in properly');
    return false;
  }
  // prevent form's default submit action.
  e.preventDefault();
  document.getElementById('file').files.forEach((f) => uploadMaybeTarFileToGCS(f.name, f));
}

function submitUrls(e) {
  if (!accessToken) {
    alert('Not signed in properly');
    return false;
  }
  // prevent form's default submit action.
  e.preventDefault();
  for (const url of document.getElementById('urls').value.split('\n')) {
    fetch(url).then((response) => response.blob())
        .then(
        (blob) => uploadMaybeTarFileToGCS(url.substring(url.lastIndexOf('/') + 1), blob));
  }
}

function uploadMaybeTarFileToGCS(name, contents) {
  if (name.endsWith('.tar')) {
    createTarReader().readAsArrayBuffer(contents);
  } else {
    uploadFileToGCS(name, contents, ingestEEAssetFromGCS);
  }
}

function createTarReader() {
  const reader = new FileReader();
  reader.onload = function (event) {
    untar(reader.result).then(
        function (extractedFiles) { // onSuccess
          for (const file of extractedFiles) {
            uploadFileToGCS(file.name, file.size, file.blob,
                ingestEEAssetFromGCS);
          }
          // document.getElementById('results').textContent = JSON.stringify(extractedFiles, null, 2);
        },
        function (err) {
          console.error('Untar Error', event);
        }
    )
  };
  reader.onerror = function (event) {
    console.error('FileReader Error', event);
  };
  return reader;
}

function uploadFileToGCS(name, contents, callback) {
  // get an encoded file name - either from the name input or from the file itself
  const fileName = encodeURIComponent(name);
  // using the simple media upload as per the spec here:
  // https://cloud.google.com/storage/docs/json_api/v1/how-tos/simple-upload
  const URL = mostOfUrl + fileName;
  // Do the upload.
  // We're naively getting the MIME type from the file extension.
  fetch(URL, {
    method: 'POST',
    headers: new Headers({
      // We leave out the type and size, since it seems to upload ok without it.
      // 'Content-Length': size,
      'Authorization': `Bearer ${accessToken}`,
    }),
    body: contents,
  })
      .then(r => r.json())
      .then((resp) => callback(resp.bucket, resp.name))
      .catch(err => {
        console.log(err);
        resultDiv.innerHTML += '<br>Error uploading ' + name + ': ' + err;
      });
}

function ingestEEAssetFromGCS(gcsBucket, gcsName) {
  const id = ee.data.newTaskId();
  const request = {id: 'users/janak/testupload/' + replaceEarthEngineIllegalCharacters(gcsName),
    tilesets: [{sources: [{primaryPath: 'gs://' + gcsBucket + '/' + gcsName}]}],
  };
  const task = ee.data.startIngestion(id, request);
  const uploadId = ('id' in task) ? task.id : id;
  const tail = ' ' + gcsName + ' to EarthEngine with task id ' + uploadId;
  if (('started' in task) && task.started === 'OK') {
    resultDiv.innerHTML += '<br>Importing' + tail;
  } else {
    resultDiv.innerHTML += '<br>Error importing' + tail;
  }
}

function replaceEarthEngineIllegalCharacters(fileName) {
  return fileName.replace(/[^A-Za-z0-9_/-]/g, '_');
}
