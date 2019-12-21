import {createServer} from 'http';
import {getMillisecondsToDateString} from '../docs/time_util.js';
import {generateEarthEngineToken} from '../ee_lib/ee_token_creator.js';

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
 * Pre-fetch token, and periodically get a new one (every 40 minutes, leaving at
 * least 20 minutes of validity for the current token).
 */
function generateTokenPeriodically() {
  currentTokenPromise = generateEarthEngineToken();
  setTimeout(generateTokenPeriodically, TIME_BEFORE_REGENERATION);
}

generateTokenPeriodically();

createServer(async (req, res) => {
  const origin = req.headers['origin'];
  // TODO(janakr): Add check that request has valid Google user token, so this
  //  will only return tokens to logged-in users, mitigating abuse potential.
  if (origin !== 'http://localhost:8080' &&
      origin !== 'https://givedirectly.github.io') {
    res.writeHead(401, {'Content-type': 'text/plain'});
    res.write('Unauthorized origin');
    res.end();
    return;
  }
  let data = await currentTokenPromise;
  if (getMillisecondsToDateString(data.expireTime) < MIN_TOKEN_LIFETIME) {
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
