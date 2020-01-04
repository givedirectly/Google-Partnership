import {eeLegacyPathPrefix, gdEePathPrefix} from '../ee_paths.js';
import {transformEarthEngineFailureMessage} from '../ee_promise_cache.js';
import {showError} from '../error.js';
import {getDisaster} from '../resources.js';

import {listEeAssets} from './ee_utils.js';

export {setUpAllHeaders};

const EARTH_ENGINE_PREFIX = eeLegacyPathPrefix;

const BUCKET = 'mapping-crisis.appspot.com';
const BASE_UPLOAD_URL =
    `https://www.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;
const BASE_LISTING_URL = `https://www.googleapis.com/storage/v1/b/${BUCKET}/o`;

const mostOfUploadUrl =
    BASE_UPLOAD_URL + '?' + encodeURIComponent('uploadType=media') + '&name=';

const resultDiv = document.getElementById('results');

let gcsHeader = null;
let listRequest = null;
let deleteRequest = null;

/**
 * Initializes all headers necessary for GCS operations, then enable page.
 * @param {gapi.auth2.AuthResponse} authResponse Token coming from gapi
 *     authentication.
 */
function setUpAllHeaders(authResponse) {
  gcsHeader =
      new Headers({'Authorization': 'Bearer ' + authResponse.access_token});
  deleteRequest = {method: 'DELETE', headers: gcsHeader};
  listRequest = {method: 'GET', headers: gcsHeader};
  enableWhenReady();
}

/** Enables the form once all necessary libraries are loaded. */
function enableWhenReady() {
  document.getElementById('fileButton').disabled = false;
  document.getElementById('fileButton').onclick = submitFiles;
  updateStatus();
}

/**
 * Processes files and asset name user gave, mostly asynchronously.
 * @param {Event} e
 */
async function submitFiles(e) {
  // prevent form's default submit action.
  e.preventDefault();
  const collectionName = document.getElementById('collectionName').value;
  const qualifiedName = getDisaster() + '/' + collectionName;
  const gcsListingPromise = listGCSFiles(qualifiedName);
  const assetPromise = maybeCreateImageCollection(qualifiedName);
  const eeListingPromise = assetPromise.then(
      () => listEeAssets(EARTH_ENGINE_PREFIX + qualifiedName));

  // Build up a dictionary of already uploaded images so we don't do extra work
  // uploading or importing, and can tell the user what to delete.
  const gcsItems = await gcsListingPromise;
  const fileStatuses = new Map();
  // First put all elements from GCS into map, then go over EE and
  // overwrite.
  const gcsPrefixLength = (qualifiedName + '/').length;
  for (const item of gcsItems) {
    fileStatuses.set(
        replaceEarthEngineIllegalCharacters(item.name.substr(gcsPrefixLength)),
        FileRemoteStatus.GCS_ONLY);
  }
  const eeItems = await eeListingPromise;
  const eePrefixLength = (gdEePathPrefix + qualifiedName + '/').length;
  for (const {id} of eeItems) {
    const name = id.substring(eePrefixLength);
    const oldStatus = fileStatuses.get(name);
    if (oldStatus) {
      fileStatuses.set(name, FileRemoteStatus.PRESENT_EVERYWHERE);
    } else {
      fileStatuses.set(name, FileRemoteStatus.EE_ONLY);
    }
  }
  processFiles(qualifiedName, fileStatuses);
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
 * @param {string} qualifiedName
 * @param {Map} fileStatuses
 */
function processFiles(qualifiedName, fileStatuses) {
  const files = document.getElementById('files').files;
  foundTopFiles += files.length;
  for (const file of files) {
    const mungedName = replaceEarthEngineIllegalCharacters(file.name);
    const status = fileStatuses.get(mungedName) || FileRemoteStatus.NEW;
    switch (status) {
      case FileRemoteStatus.NEW:
        uploadFileToGCS(file.name, file, qualifiedName, importEEAssetFromGCS);
        break;
      case FileRemoteStatus.GCS_ONLY:
        alreadyUploadedToGCS++;
        importEEAssetFromGCS(BUCKET, qualifiedName, file.name);
        break;
      case FileRemoteStatus.EE_ONLY:
        alreadyImportedToEE++;
        addFileToDelete(file.name);
        break;
      case FileRemoteStatus.PRESENT_EVERYWHERE:
        alreadyPresentEverywhere++;
        deleteGCSFile(qualifiedName, file.name);
        break;
    }
    processedFiles++;
  }
}

/** See processFiles for usage. */
const FileRemoteStatus = Object.freeze({
  'NEW': 0,
  'GCS_ONLY': 1,
  'EE_ONLY': 2,
  'PRESENT_EVERYWHERE': 3,
});

/**
 * Uploads file to GCS, then invokes callback (to import it to EE).
 * Lovingly copied/modified from
 * https://github.com/joepin/google-cloud-storage/blob/master/public/index.html
 *
 * @param {string} name file name, ideally with a single path segment
 * @param {Blob} contents
 * @param {string} qualifiedName Like '2017-harvey/noaa-images'
 * @param {Function} callback Will be passed the GCS bucket, asset name, and
 *     file name
 */
async function uploadFileToGCS(name, contents, qualifiedName, callback) {
  startedUploadToGCS++;
  const fileName = encodeURIComponent(qualifiedName + '/' + name);
  // Use the simple media upload as per the spec here:
  // https://cloud.google.com/storage/docs/json_api/v1/how-tos/simple-upload
  const URL = mostOfUploadUrl + fileName;
  // Do the upload.
  const request = {
    method: 'POST',
    headers: gcsHeader,
    body: contents,
  };
  let bucket;
  try {
    const result = await fetch(URL, request);
    const json = await result.json();
    if (result.status !== 200) {
      throw new Error('Unable to fetch from GCS: ' + json.error.message);
    }
    ({bucket} = json);
  } catch (err) {
    resultDiv.innerHTML += '<br>Error uploading ' + name + ': ' + err;
    showError(err, 'Error uploading ' + name);
    throw err;
  }
  uploadedToGCS++;
  try {
    return callback(bucket, qualifiedName, name);
  } catch (err) {
    resultDiv.innerHTML += '<br>Error processing ' + name + ': ' + err;
    showError(err, 'Error processing ' + name);
    throw err;
  }
}

/**
 * Checks to see if asset given by `qualifiedName` is present. If not, creates
 * it and makes it world-readable.
 *
 * @param {string} qualifiedName Must contain only legal EE characters. Like
 *     '2017-harvey/noaa-images'
 * @return {Promise<void>} Promise to wait for operation completion on
 */
function maybeCreateImageCollection(qualifiedName) {
  const assetName = EARTH_ENGINE_PREFIX + qualifiedName;
  return new Promise(
             (resolve, reject) => ee.data.getAsset(
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
                             reject(
                                 transformEarthEngineFailureMessage(failure));
                           } else {
                             ee.data.setAssetAcl(
                                 assetName, {all_users_can_read: true},
                                 (aclResult, failure) => {
                                   if (failure) {
                                     reject(transformEarthEngineFailureMessage(
                                         failure));
                                   } else {
                                     resolve();
                                   }
                                 });
                           }
                         });
                   } else {
                     resolve();
                   }
                 }))
      .catch((err) => {
        showError(err, 'Error creating image collection in EarthEngine');
        setStatusDiv(err);
        throw err;
      });
}

/**
 * Imports image into EE ImageCollection from GCS file.
 *
 * @param {string} gcsBucket
 * @param {string} qualifiedName
 * @param {string} name Must contain only legal EE characters
 */
function importEEAssetFromGCS(gcsBucket, qualifiedName, name) {
  const id = ee.data.newTaskId()[0];
  const request = {
    id: EARTH_ENGINE_PREFIX + qualifiedName + '/' +
        replaceEarthEngineIllegalCharacters(name),
    tilesets: [{
      sources: [
        {primaryPath: 'gs://' + gcsBucket + '/' + qualifiedName + '/' + name},
      ],
    }],
  };
  ee.data.startIngestion(id, request, (task, failure) => {
    const uploadId = (task && 'taskId' in task) ? task.taskId : id;
    const tail = ' ' + name + ' to EarthEngine with task id ' + uploadId;
    if (failure) {
      resultDiv.innerHTML += '<br>Error importing' + tail + ': ' + failure;
      showError(failure, 'Error importing' + tail);
      return;
    }
    startedEETask++;
    if (('started' in task) && task.started === 'OK') {
      resultDiv.innerHTML += '<br>Importing' + tail;
    } else {
      showError('Error importing' + tail);
      resultDiv.innerHTML += '<br>Error importing' + tail;
    }
  });
}

/**
 * Lists all GCS files in a collection, to avoid uploading them again (and to
 * delete them if they are already in EE). Since a maximum of 1000 entries is
 * returned, has to do some recursive footwork.
 * @param {string} qualifiedName Like '2017-harvey/noaa-images'
 * @return {Promise<Array<string>>} When resolved, contains list of items
 */
function listGCSFiles(qualifiedName) {
  return listGCSFilesRecursive(qualifiedName, null, []);
}

/**
 * Helper function. Accumulates results, issues follow-up queries with page
 * token if needed.
 * @param {string} qualifiedName Full path to folder, like
 *     '2017-harvey/noaa-images'
 * @param {?string} nextPageToken Token for page of results to request, used
 *     when listing spans multiple pages
 * @param {Array<string>} accumulatedList All files found so far
 * @return {Promise<Array<string>>} List of files
 */
function listGCSFilesRecursive(qualifiedName, nextPageToken, accumulatedList) {
  const listUrl = BASE_LISTING_URL +
      '?prefix=' + encodeURIComponent(qualifiedName) +
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
        qualifiedName, resp.nextPageToken, accumulatedList);
  });
}

/**
 * Deletes a file from GCS.
 * @param {string} qualifiedName
 * @param {string} name File name
 * @return {Promise<void>}
 */
function deleteGCSFile(qualifiedName, name) {
  const deleteUrl =
      BASE_LISTING_URL + '/' + encodeURIComponent(qualifiedName + '/' + name);
  return fetch(deleteUrl, deleteRequest).then((resp) => {
    if (resp.ok) {
      deletedFromGCS++;
      addFileToDelete(name);
    } else {
      resultDiv.innerHTML +=
          '<br>Error deleting ' + name + ' from GCS: ' + resp.status;
    }
  });
}

/**
 * Transforms all characters not allowed in EE asset paths into '_'.
 * @param {string} fileName
 * @return {string} Transformed name
 */
function replaceEarthEngineIllegalCharacters(fileName) {
  return fileName.replace(/[^A-Za-z0-9_/-]/g, '_');
}

/** These variables track progress of the uploads/imports for display. */
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
