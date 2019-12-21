import * as GoogleAuth from 'google-auth-library';
import {createServer} from 'http';
import {parse} from 'url';

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

// Regenerate if we ever see a token with < 10-minute remaining validity. This
// should never happen, but maybe the periodic job doesn't run. Paranoia!
const MIN_TOKEN_LIFETIME = 10 * ONE_MINUTE_IN_MILLISECONDS;

/**
 * Result of most recent call to {@link generateEarthEngineToken}. Because there
 * is no requirement that tokens be unique per user, we re-use tokens for almost
 * their full lifetime of 1 hour, minimizing work.
 * @type {Promise<{accessToken: string, expireTime: string}>}
 */
let currentTokenPromise;

/**
 * Pre-fetches token and periodically gets a new one (every 40 minutes, leaving
 * at least 20 minutes of validity for the current token).
 */
function generateTokenPeriodically() {
  currentTokenPromise = generateEarthEngineToken();
  setTimeout(generateTokenPeriodically, TIME_BEFORE_REGENERATION);
}

generateTokenPeriodically();

const CLIENT_ID =
    '38420505624-boghq4foqi5anc9kc5c5tsq82ar9k4n0.apps.googleusercontent.com';
const client = new GoogleAuth.default.OAuth2Client(CLIENT_ID);

createServer(async (req, res) => {
  const origin = req.headers['origin'];
  if (origin !== 'http://localhost:8080' &&
      origin !== 'https://givedirectly.github.io') {
    fail(res);
    return;
  }

  const idToken = parse(req.url, true).query.idToken;
  try {
    await client.verifyIdToken({idToken: idToken, audience: CLIENT_ID});
  } catch (err) {
    fail(res);
    return;
  }
  let data = await currentTokenPromise;
  // This calculation is same as that in
  // authenticate.js#getMillisecondsToDateString but better to keep this server
  // self-contained and duplicate a line.
  if (Date.parse(data.expireTime) - Date.now() < MIN_TOKEN_LIFETIME) {
    // Should never happen because of periodic generation above, but generate a
    // new token if it does.
    currentTokenPromise = generateEarthEngineToken();
    data = await currentTokenPromise;
  }
  const headers = Object.assign({}, RESPONSE_HEADERS);
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin
  headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(200, headers);
  res.write(JSON.stringify(data));
  res.end();
}).listen(9080);

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
