// Warning: this works with Babel and native modules, but not with Cypress's
// browserify (get an error that util.promisify is not a function). So it's a
// bit brittle.
import * as googleapis from 'googleapis';

export {generateEarthEngineToken};

// Cope with slight differences between Babel/Node transpilation of googleapis.
const google = googleapis.google || googleapis.default.google;

let authAndClientPromise;

/**
 * Produces an EarthEngine token that can be used by production code. We use
 * the somewhat legacy and very poorly documented but still supported
 * googleapis/google-api-nodejs-client library. The new hotness,
 * googleapis/google-cloud-node, does not have an "idiomatic" library for
 * IAM Credentials operations.
 *
 * Using our service account, we request an access token with the
 * `earthengine.readonly` scope.
 *
 * @return {Promise<{accessToken: string, expireTime: string}>}
 */
function generateEarthEngineToken() {
  if (!authAndClientPromise) {
    // This is the scope needed to use iamcredentials:
    // https://developers.google.com/identity/protocols/googlescopes#iamcredentialsv1
    const auth = new google.auth.GoogleAuth(
        {scopes: ['https://www.googleapis.com/auth/cloud-platform']});
    authAndClientPromise = {auth, client: auth.getClient()};
  }
  return authAndClientPromise.client.then(
      (client) => createTokenPromise(authAndClientPromise.auth, client));
}

/**
 * Creates a {@link Promise} that will perform the work of requesting an access
 * token and returning it.
 * @param {google.auth.GoogleAuth} auth Authenticated `GoogleAuth` object
 * @param {google.auth.JWT} client Client retrieved from `auth`
 * @return {Promise<{accessToken: string, expireTime: string}>} Promise with
 *     token result: access token and expiration time
 */
function createTokenPromise(auth, client) {
  return new Promise(
      (resolve, reject) => requestToken(auth, client, (error, response) => {
        // See
        // https://github.com/googleapis/nodejs-googleapis-common/blob/5cf2732a39b3c5d56dd377293e500ad82de62663/src/api.ts#L69
        if (error) {
          // Error is actually a GaxiosError.
          // https://github.com/googleapis/gaxios/blob/d21e08d2aada980d39bc5ca7093d54452be2d646/src/common.ts#L20
          reject(error);
          return;
        }
        // Response is a GaxiosResponse.
        // https://github.com/googleapis/gaxios/blob/d21e08d2aada980d39bc5ca7093d54452be2d646/src/common.ts#L45
        if (response.status === 200 && response.data &&
            response.data.accessToken) {
          resolve(response.data);
        }
        reject(new Error(response.statusText + ' \n(' + response + ')'));
      }));
}

/**
 * Initiates a `GenerateAccessToken` request. See
 * https://googleapis.dev/nodejs/googleapis/latest/iamcredentials/classes/Resource$Projects$Serviceaccounts.html#generateAccessToken
 * @param {google.auth.GoogleAuth} auth See {@link createTokenPromise}
 * @param {google.auth.JWT} client See {@link createTokenPromise}
 * @param {Function} callback Callback to call when request completes. Given two
 *     arguments, a {@link GaxiosError} and a {@link GaxiosResponse}, exactly
 *     one of which will be null.
 */
function requestToken(auth, client, callback) {
  // On Google App Engine, client email not available. Running locally, the
  // .json file used for tests has an email. We can't use the same account for
  // both without developers having the prod private key on their machines,
  // which is not desirable.
  const serviceAccount = client.email ?
      client.email :
      // If this changes, change the README as well.
      'earthengine-token-provider@mapping-crisis.iam.gserviceaccount.com';
  google.iamcredentials({version: 'v1', auth})
      .projects.serviceAccounts.generateAccessToken(
          {
            // See
            // https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken
            name: 'projects/-/serviceAccounts/' + serviceAccount,
            // Just need read-only EE access, although
            // apparently write access can be needed for some
            // non-write tasks.
            requestBody: {
              scope: [
                'https://www.googleapis.com/auth/earthengine.readonly',
              ],
            },
          },
          callback);
}
