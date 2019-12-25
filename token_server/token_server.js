import * as GoogleAuth from 'google-auth-library';
import {createServer} from 'http';
// TODO(janakr): this is a pretty random package. Maybe find a more popular one.
import parseBody from 'urlencoded-body-parser';
import {CLIENT_ID} from './auth_utils/common_auth_utils.js';

import {generateEarthEngineToken} from './ee_token_creator.js';

const RESPONSE_HEADERS = {
  'Content-type': 'text/plain',
  'Vary': 'Origin',
};

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

// Regenerate token every 40 minutes, hopefully will be ready whenever a user
// needs one. Tokens last 1 hour, user code regenerates with 5 minutes left on
// token.
const TIME_BEFORE_REGENERATION = 40 * ONE_MINUTE_IN_MILLISECONDS;

/**
 * Result of most recent call to {@link generateEarthEngineToken}. Because there
 * is no requirement that tokens be unique per user, we re-use tokens for almost
 * their full lifetime of 1 hour, minimizing work.
 *
 * After the initial {@link Promise} returned by
 * {@link generateEarthEngineToken} resolves, this will always have a resolved
 * {@link Promise}, because {@link generateTokenPeriodically} only sets it when
 * further calls to {@link generateEarthEngineToken} have resolved.
 *
 * @type {Promise<{accessToken: string, expireTime: string}>}
 */
let currentTokenPromise = generateEarthEngineToken();

setTimeout(generateTokenPeriodically, TIME_BEFORE_REGENERATION);

/**
 * Pre-fetches token and periodically gets a new one (every 40 minutes, leaving
 * at least 20 minutes of validity for the current token).
 *
 * Only sets {@link currentTokenPromise} after {@link generateEarthEngineToken}
 * promise resolves, so that web requests that come in during refresh don't have
 * to wait, they can just use the old token.
 */
function generateTokenPeriodically() {
  generateEarthEngineToken().then(
      (token) => currentTokenPromise = Promise.resolve(token));
  setTimeout(generateTokenPeriodically, TIME_BEFORE_REGENERATION);
}

generateTokenPeriodically();
currentTokenPromise.then(console.log, console.log);

const client = new GoogleAuth.default.OAuth2Client(CLIENT_ID);

/**
 * See
 * https://nodejs.org/api/http.html#http_http_createserver_options_requestlistener
 * or https://www.w3schools.com/nodejs/nodejs_http.asp for a gentle intro.
 */
createServer(async (req, res) => {
  const origin = req.headers['origin'];
  if (origin !== 'http://localhost:8080' &&
      origin !== 'https://givedirectly.github.io') {
    fail(res);
    return;
  }

  try {
    const {idToken} = await parseBody(req);
    await client.verifyIdToken({idToken: idToken, audience: CLIENT_ID});
  } catch (err) {
    console.log(err);
    fail(res);
    return;
  }
  const data = await currentTokenPromise;
  const headers = Object.assign({}, RESPONSE_HEADERS);
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin
  headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(200, headers);
  res.write(JSON.stringify(data));
  res.end();
}).listen(process.env.PORT);

/**
 * Returns a generic failure to the client.
 * @param {http.ServerResponse} res
 */
function fail(res) {
  // Without this header, JavaScript can't catch the error and show anything to
  // user.
  res.writeHead(
      401, {'Content-type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
  res.write('Unauthorized');
  res.end();
}
