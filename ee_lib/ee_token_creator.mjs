// Warning: this works with Babel, but not with Cypress's browserify (get an
// error that util.promisify is not a function). So it's a bit brittle.
import * as googleapis from 'googleapis';

export {generateEarthEngineToken};

// Cope with slight differences between Babel/Node transpilation of googleapis.
const google = googleapis.google || googleapis.default.google;

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
 * @return {Promise<string>}
 */
function generateEarthEngineToken() {
  // This is the scope needed to use iamcredentials:
  // https://developers.google.com/identity/protocols/googlescopes#iamcredentialsv1
  const auth = new google.auth.GoogleAuth(
      {scopes: ['https://www.googleapis.com/auth/cloud-platform']});
  return auth.getClient().then(
      // See
      // https://googleapis.dev/nodejs/googleapis/latest/iamcredentials/classes/Resource$Projects$Serviceaccounts.html#generateAccessToken
      (client) => new Promise((resolve, reject) =>
          google.iamcredentials({version: 'v1', auth}).
              projects.
              serviceAccounts.
              generateAccessToken(
                  {
                    // See
                    // https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken
                    name: 'projects/-/serviceAccounts/' + client.email,
                    // Just need read-only EE access, although apparently
                    // write access can be needed for some non-write tasks.
                    requestBody: {
                      scope: [
                        'https://www.googleapis.com/auth/earthengine.readonly',
                      ],
                    },
                  },
                  (error, response) => {
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
                    reject(new Error(
                        response.statusText + ' \n(' + response + ')'));
                  })));
}

