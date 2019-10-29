import {Authenticator} from '../authenticate.js';
import {getDisaster} from '../resources.js';
import TaskAccumulator from './task_accumulator.js';

export {taskAccumulator};

const earthEngineAssetBase = 'users/gd/' + getDisaster();
const earthEnginePrefix =
    'projects/earthengine-legacy/assets/' + earthEngineAssetBase;

const BUCKET = 'givedirectly.appspot.com';
const BASE_UPLOAD_URL =
    `https://www.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;
const BASE_LISTING_URL = `https://www.googleapis.com/storage/v1/b/${BUCKET}/o`;
const storageScope = 'https://www.googleapis.com/auth/devstorage.read_write';

const mostOfUploadUrl =
    BASE_UPLOAD_URL + '?' + encodeURIComponent('uploadType=media') + '&name=';

const resultDiv = document.getElementById('results');

let gcsHeader = null;
let listRequest = null;
let deleteRequest = null;

/**
 * Initialize all headers necessary for GCS operations.
 * @param {string} accessToken Token coming from gapi authentication.
 */
function setUpAllHeaders(accessToken) {
  gcsHeader = new Headers({'Authorization': 'Bearer ' + accessToken});
  deleteRequest = {method: 'DELETE', headers: gcsHeader};
  listRequest = {method: 'GET', headers: gcsHeader};
  taskAccumulator.taskCompleted();
}

/** Enables the form once all necessary libraries are loaded. */
function enableWhenReady() {
  document.getElementById('fileButton').disabled = false;
  document.getElementById('fileButton').onclick = submitFiles;
  updateStatus();
}

// Necessary for listAssets.
ee.data.setCloudApiEnabled(true);

// 3 tasks: EE authentication, OAuth2 token retrieval, and page load.
const taskAccumulator = new TaskAccumulator(3, enableWhenReady);
// Perform EE login/Google OAuth2 process.
const authenticator = new Authenticator(
    setUpAllHeaders, () => taskAccumulator.taskCompleted(), setStatusDiv,
    [storageScope]);
authenticator.start();

/**
 * Processes files and asset name user gave, mostly asynchronously.
 * @param {Event} e
 * @return {boolean}
 */
function submitFiles(e) {
  // prevent form's default submit action.
  e.preventDefault();
  const collectionName = document.getElementById('collectionName').value;
  const gcsListingPromise = listGCSFiles(collectionName);
  const assetPromise = maybeCreateImageCollection(collectionName);
  const listingPromise =
      assetPromise.then(() => listEEAssetFiles(collectionName));

  // Build up a dictionary of already uploaded images so we don't do extra work
  // uploading or importing, and can tell the user what to delete.
  Promise.all([gcsListingPromise, listingPromise])
      .then((list) => {
        const gcsItems = list[0];
        const eeItems = list[1];
        const fileStatuses = new Map();
        // First put all elements from GCS into map, then go over EE and
        // overwrite.
        const gcsPrefixLength = (collectionName + '/').length;
        for (const item of gcsItems) {
          fileStatuses.set(
              item.name.substr(gcsPrefixLength), FileRemoteStatus.GCS_ONLY);
        }
        const eePrefixLength =
            (earthEngineAssetBase + collectionName + '/').length;
        // assets is apparently null if there are no items.
        if (eeItems.assets) {
          for (const item of eeItems.assets) {
            const name = item.id.substring(eePrefixLength);
            const oldStatus = fileStatuses.get(name);
            if (oldStatus) {
              fileStatuses.set(name, FileRemoteStatus.PRESENT_EVERYWHERE);
            } else {
              fileStatuses.set(name, FileRemoteStatus.EE_ONLY);
            }
          }
        }
        return fileStatuses;
      })
      .then((fileStatuses) => processFiles(collectionName, fileStatuses));
  return false;
}

/**
 * Given the desired asset, and a dictionary of statuses for all already known
 * files, processes each file selected by the user and either:
 *
 *   1. Tell the user to delete the file locally if it is already in EE
 * (Status.EE_ONLY);
 *   2. Do that and delete the file from GCS if it is already in GCS as well
 * (Status.PRESENT_EVERYWHERE);
 *   3. Import the file into EE if it is already in GCS (Status.GCS_ONLY;
 *   4. Upload it to GCS and then import it from GCS into EE (Status.NEW).
 *
 * Files are uploaded and imported with illegal characters replaced by '_'. If
 * files are not unique after that transformation, that sucks.
 *
 * TODO(janakr): delete files that are PRESENT_EVERYWHERE even if not listed?
 *
 * @param {string} collectionName
 * @param {Map} fileStatuses
 */
function processFiles(collectionName, fileStatuses) {
  const files = document.getElementById('file').files;
  foundTopFiles += files.length;
  for (const file of files) {
    const mungedName = replaceEarthEngineIllegalCharacters(file.name);
    const status = fileStatuses.get(mungedName) || FileRemoteStatus.NEW;
    switch (status) {
      case FileRemoteStatus.NEW:
        uploadFileToGCS(mungedName, file, collectionName, importEEAssetFromGCS);
        break;
      case FileRemoteStatus.GCS_ONLY:
        alreadyUploadedToGCS++;
        importEEAssetFromGCS(BUCKET, collectionName, mungedName);
        break;
      case FileRemoteStatus.EE_ONLY:
        alreadyImportedToEE++;
        addFileToDelete(file.name);
        break;
      case FileRemoteStatus.PRESENT_EVERYWHERE:
        alreadyPresentEverywhere++;
        deleteGCSFile(collectionName, mungedName, file.name);
        break;
    }
    processedFiles++;
  }
}

/** See processFiles for usage. */
const FileRemoteStatus = {
  'NEW': 0,
  'GCS_ONLY': 1,
  'EE_ONLY': 2,
  'PRESENT_EVERYWHERE': 3,
};

/**
 * Uploads file to GCS, then invokes callback (to import it to EE).
 * Lovingly copied/modified from
 * https://github.com/joepin/google-cloud-storage/blob/master/public/index.html
 *
 * @param {string} name file name, ideally with a single path segment
 * @param {Blob} contents
 * @param {string} collectionName name of EE ImageCollection and parent folder
 *     in GCS
 * @param {Function} callback Will be passed the GCS bucket, asset name, and
 *     file name
 */
function uploadFileToGCS(name, contents, collectionName, callback) {
  startedUploadToGCS++;
  const fileName = encodeURIComponent(collectionName + '/' + name);
  // Use the simple media upload as per the spec here:
  // https://cloud.google.com/storage/docs/json_api/v1/how-tos/simple-upload
  const URL = mostOfUploadUrl + fileName;
  // Do the upload.
  const request = {
    method: 'POST',
    headers: gcsHeader,
    body: contents,
  };
  fetch(URL, request)
      .then((r) => r.json())
      .then((r) => {
        uploadedToGCS++;
        return r;
      })
      .catch((err) => {
        console.error(err);
        resultDiv.innerHTML += '<br>Error uploading ' + name + ': ' + err;
        throw err;
      })
      .then((result) => callback(result.bucket, collectionName, name))
      .catch((err) => {
        console.error(err);
        resultDiv.innerHTML += '<br>Error processing ' + name + ': ' + err;
      });
}

/**
 * Checks to see if asset given by collectionName is present. If not, creates it
 * and makes it world-readable.
 *
 * @param {string} collectionName Must contain only legal EE characters
 * @return {Promise<undefined>} Promise to wait for operation completion on
 */
function maybeCreateImageCollection(collectionName) {
  const assetName = earthEngineAssetBase + collectionName;
  return new Promise(
             (resolveFunction, rejectFunction) => ee.data.getAsset(
                 assetName,
                 (getResult) => {
                   if (!getResult) {
                     // TODO(janakr): this swallows any actual errors in getting
                     // asset.
                     // TODO(janakr): track if actually created to avoid
                     // unnecessary listing?
                     ee.data.createAsset(
                         {id: assetName, type: 'ImageCollection'}, assetName,
                         false, {}, (createResult, failure) => {
                           if (failure) {
                             rejectFunction(failure);
                           } else {
                             ee.data.setAssetAcl(
                                 assetName, {all_users_can_read: true},
                                 (aclResult, failure) => {
                                   if (failure) {
                                     rejectFunction(failure);
                                   } else {
                                     resolveFunction(undefined);
                                   }
                                 });
                           }
                         });
                   } else {
                     resolveFunction(undefined);
                   }
                 }))
      .catch((err) => {
        setStatusDiv(err);
        throw err;
      });
}

/**
 * Imports image into EE ImageCollection from GCS file.
 *
 * @param {string} gcsBucket
 * @param {string} collectionName
 * @param {string} name Must contain only legal EE characters
 */
function importEEAssetFromGCS(gcsBucket, collectionName, name) {
  const id = ee.data.newTaskId()[0];
  const request = {
    id: earthEnginePrefix + collectionName + '/' + name,
    tilesets: [{
      sources: [
        {primaryPath: 'gs://' + gcsBucket + '/' + collectionName + '/' + name},
      ],
    }],
  };
  ee.data.startIngestion(id, request, (task, failure) => {
    const uploadId = (task && 'taskId' in task) ? task.taskId : id;
    const tail = ' ' + name + ' to EarthEngine with task id ' + uploadId;
    if (failure) {
      resultDiv.innerHTML += '<br>Error importing ' + tail + ': ' + failure;
      return;
    }
    startedEETask++;
    if (('started' in task) && task.started === 'OK') {
      resultDiv.innerHTML += '<br>Importing' + tail;
    } else {
      resultDiv.innerHTML += '<br>Error importing' + tail;
    }
  });
}

/**
 * Lists all GCS files in a collection, to avoid uploading them again (and to
 * delete them if they are already in EE). Since a maximum of 1000 entries is
 * returned, has to do some recursive footwork.
 * @param {string} collectionName
 * @return {Promise} When resolved, contains list of items
 */
function listGCSFiles(collectionName) {
  return listGCSFilesRecursive(collectionName, null, []);
}

/**
 * Helper function. Accumulates results, issues follow-up queries with page
 * token if needed.
 * @param {string} collectionName Name of folder
 * @param {?string} nextPageToken Token for page of results to request, used
 *     when listing spans multiple pages
 * @param {List} accumulatedList All files found so far
 * @return {Promise}
 */
function listGCSFilesRecursive(collectionName, nextPageToken, accumulatedList) {
  const listUrl = BASE_LISTING_URL +
      '?prefix=' + encodeURIComponent(collectionName) +
      (nextPageToken ? '&pageToken=' + nextPageToken : '');
  return fetch(listUrl, listRequest).then((r) => r.json()).then((resp) => {
    if (!resp.items) {
      // Can happen if folder does not exist in GCS yet.
      return accumulatedList;
    }
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
    return listGCSFilesRecursive(
        collectionName, resp.nextPageToken, accumulatedList);
  });
}

/**
 * Deletes a file from GCS.
 * @param {string} collectionName
 * @param {string} name
 * @param {string} originalName Name before munging, to display to user
 * @return {Promise}
 */
function deleteGCSFile(collectionName, name, originalName) {
  const deleteUrl =
      BASE_LISTING_URL + '/' + encodeURIComponent(collectionName + '/' + name);
  return fetch(deleteUrl, deleteRequest).then((resp) => {
    if (resp.ok) {
      deletedFromGCS++;
      addFileToDelete(originalName);
    } else {
      resultDiv.innerHTML +=
          '<br>Error deleting ' + name + ' from GCS: ' + resp.status;
    }
  });
}

/**
 * Lists all images under the given EE asset.
 *
 * @param {string} assetName
 * @return {Promise}
 */
function listEEAssetFiles(assetName) {
  // Pass an empty callback because it makes this return a Promise.
  return ee.data.listAssets(earthEnginePrefix + assetName, {}, () => {});
}

/**
 * Transforms all characters not allowed in EE asset paths into '_'.
 * @param {string} fileName
 * @return {string} Transformed name
 */
function replaceEarthEngineIllegalCharacters(fileName) {
  return fileName.replace(/[^A-Za-z0-9_/-]/g, '_');
}

/**
 * These variables track progress of the uploads/imports for display.
 */
let foundTopFiles = 0;
let processedFiles = 0;
let startedUploadToGCS = 0;
let alreadyUploadedToGCS = 0;
let uploadedToGCS = 0;
let alreadyImportedToEE = 0;
let alreadyPresentEverywhere = 0;
let startedEETask = 0;
let deletedFromGCS = 0;

/**
 * Sets the status of all current operations, and restarts itself half a second
 * later to do it again.
 */
function updateStatus() {
  setStatusDiv(
      'Found ' + foundTopFiles + ' files<br/>' +
      'Processed ' + processedFiles + ' files<br/>' +
      'Started upload of ' + startedUploadToGCS + ' files to GCS<br/>' +
      'Found ' + (alreadyUploadedToGCS + alreadyPresentEverywhere) +
      ' files previously uploaded to GCS<br/>' +
      'Uploaded ' + uploadedToGCS + ' files to GCS<br/>' +
      'Started EE ingestion of ' + startedEETask + ' files<br/>' +
      'Found ' + (alreadyImportedToEE + alreadyPresentEverywhere) +
      ' files previously imported to EE<br/>' +
      'Found ' + alreadyPresentEverywhere +
      ' files previously imported to EE and present in GCS<br/>' +
      'Deleted ' + deletedFromGCS + ' files from GCS<br/>');
  setTimeout(updateStatus, 500);
}

/**
 * Sets the content of the status div. For errors and overall status.
 * @param {string} contents
 */
function setStatusDiv(contents) {
  document.getElementById('status_div').innerHTML = contents;
}

const filesToDelete = [];

/**
 * Adds a file to be locally deleted, for display to user when complete.
 * @param {string} file
 */
function addFileToDelete(file) {
  filesToDelete.push(file);
  const currentText = document.getElementById('command_div').innerText;
  if (currentText) {
    document.getElementById('command_div').innerText =
        '### Error: found a file to delete (' + file +
        ') after all files should have been processed ' + currentText;
    return;
  }
  if (foundTopFiles === processedFiles &&
      alreadyPresentEverywhere === deletedFromGCS) {
    document.getElementById('command_div').innerHTML =
        '# Command to delete processed files from your machine:<br/>' +
        'rm ' + filesToDelete.join(' ');
    filesToDelete.length = 0;
  }
}
