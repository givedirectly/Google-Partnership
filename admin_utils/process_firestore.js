import firebaseAdmin from 'firebase-admin';

/**
 * General utility script for modifying Firestore database. Currently configured
 * to migrate to camel case, but can be changed to do any large-scale migration.
 * Run using `node --experimental_modules admin_utils/process_firestore.js`. You
 * must set `GOOGLE_APPLICATION_CREDENTIALS` in your shell to be the path to the
 * service account secret json file for our **prod** Firestore database, not the
 * test one, which is needed for tests. See instructions in `docs/README.md`
 * about how to obtain that file, modifying those instructions to use the user
 * `gd-earthengine-user@givedirectly.org` and the project `mapping-crisis`.
 *
 * It's best to open up another shell specifically to run this script, so that
 * you don't then try to run tests with the prod service account's credentials.
 */

/**
 * Initializes Firebase admin app.
 * @return {admin.app.App}
 */
function setUpFirebase() {
  return firebaseAdmin.initializeApp(
      {
        credential: firebaseAdmin.credential.applicationDefault(),
        databaseURL: 'https://mapping-crisis.firebaseio.com',
      },
      'adminApp');
}

/**
 * Gets a map of all disasters in Firestore. Similar to `getDisastersData` in
 * docs/firestore_document.js, but uses the admin app. Remaining logic not worth
 * sharing.
 * @param {admin.app.App} adminApp
 * @return {Promise<Map<string, Object>>}
 */
async function getDisastersData(adminApp) {
  const querySnapshot =
      await adminApp.firestore().collection('disaster-metadata').get();
  const disasterData = new Map();
  querySnapshot.forEach((doc) => disasterData.set(doc.id, doc.data()));
  return disasterData;
}

/**
 * Gets all disasters, processes their data to have keys in camel case, and
 * writes back to Firestore.
 * @return {Promise<void>}
 */
async function main() {
  const adminApp = await setUpFirebase();
  const disasters = await getDisastersData(adminApp);
  // Track all modified keys, to notice errors and know what strings to change.
  const allKeys = new Set();
  for (const [name, data] of disasters) {
    const mangledKeys = new Set();
    const camelData = camelCase(data, mangledKeys);
    console.log('Keys to be modified for ' + name, mangledKeys);
    adminApp.firestore().doc('disaster-metadata/' + name).set(camelData, {
      merge: true,
    });
    mangledKeys.forEach((key) => allKeys.add(key));
  }
  console.log('All keys modified:', allKeys);
}

/**
 * Recursively processes `data` and returns a new object with all keys in camel
 * case, with a few exceptions. We transform `layers` to `layerArray` because
 * `layers` is a top-level array we would otherwise overwrite. We don't
 * transform `columns` or `colors` fields, because those are dictionaries whose
 * keys are dataset properties, which can be arbitrary.
 * @param {Object} data Data coming from Firestore
 * @param {Set<string>} mangledKeys Keys whose values were changed
 * @return {Object} Processed data
 */
function camelCase(data, mangledKeys) {
  // We don't want to modify any primitives.
  if (!data) {
    return data;
  }
  if (typeof (data) !== 'object') {
    return data;
  }
  // Arrays can have dictionaries inside them, so recurse in.
  if (data instanceof Array) {
    const camelData = [];
    for (const elt of data) {
      camelData.push(camelCase(elt, mangledKeys));
    }
    return camelData;
  }
  // Don't try to modify non-pure objects, like GeoPoint.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/constructor
  if (data.constructor.name !== 'Object') {
    return data;
  }
  const camelData = {};
  for (const [key, value] of Object.entries(data)) {
    // Need to not overwrite layers until code migration finished.
    const camelKey = (key === 'layers') ? 'layerArray' : camelCaseKey(key);
    // Keys inside 'columns' object are actual column names, and their values
    // actually are already valid camelCase, so skip. Keys inside 'colors'
    // object are just values, and their values are color names, so skip.
    camelData[camelKey] = (key === 'columns' || key === 'colors') ?
        value :
        camelCase(value, mangledKeys);
    if (camelKey !== key) {
      mangledKeys.add(key);
    }
  }
  return camelData;
}

/**
 * Transform a key into camel case. Skip it if it already has any capital
 * letter: whatever that is, it doesn't correspond to our prior schema.
 * @param {string} string
 * @return {string}
 */
function camelCaseKey(string) {
  if (string.match(/[A-Z]/)) {
    // If it has any capital letters, not a property we control.
    return string;
  }
  return string.replace(/[-_]+(.)/g, (match, char) => char.toUpperCase());
}

main();
