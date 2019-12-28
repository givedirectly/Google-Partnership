import * as GoogleAuth from 'google-auth-library';
import {createServer} from 'http';
// TODO(janakr): this is a pretty random package. Maybe find a more popular one.
import parseBody from 'urlencoded-body-parser';
import {storeGoogleCredentials} from './aws_get_credentials.js';
import {generateEarthEngineToken} from './ee_token_creator.js';

// TODO(janakr): Elastic Beanstalk doesn't seem to support https without jumping
//  through additional hoops. Sending tokens in the clear seems like a bad idea,
//  although there's nothing obviously terrible you could do with an id token or
//  the returned EE-enabled token.

// TODO(janakr): Seems impossible to deploy to Google App Engine with
//  a package that is in a sibling directory. That prevents us from sharing this
//  line with docs/authenticate.js. Filed an internal bug.
//  https://github.com/janakdr/nodejs-docs-samples/pull/1 has a minimal repro.
// The client ID from
// https://console.cloud.google.com/apis/credentials?project=mapping-crisis
const CLIENT_ID =
    '38420505624-boghq4foqi5anc9kc5c5tsq82ar9k4n0.apps.googleusercontent.com';

const RESPONSE_HEADERS = {
  'Content-type': 'text/plain',
  'Vary': 'Origin',
};

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

// Regenerate token every 40 minutes, hopefully will be ready whenever a user
// needs one. Tokens last 1 hour, user code regenerates with 5 minutes left on
// token.
const TIME_BEFORE_REGENERATION = 40 * ONE_MINUTE_IN_MILLISECONDS;

const allowedOrigins = new Set(['https://givedirectly.github.io']);

// AWS does not provide any pre-set environment variables, but we can assume
// that local runs have GOOGLE_APPLICATION_CREDENTIALS and AWS doesn't, while
// GAE has GAE_APPLICATION.
if (!process.env.GAE_APPLICATION &&
    process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // When running locally, allow requests from localhost.
  allowedOrigins.add('http://localhost:8080');
}

// AWS Elastic Beanstalk/Google App Engine tells us the port to listen to.
const port = process.env.PORT || 9080;

// Promise that resolves immediately if credentials are present, and resolves
// once secret is retrieved, written to file, and variable set to file location
// if credentials not present (meaning we're on AWS).
const googleCredentialsPresent = process.env.GOOGLE_APPLICATION_CREDENTIALS ?
    Promise.resolve() :
    storeGoogleCredentials();

/**
 * Result of most recent call to {@link generateEarthEngineToken}. Because there
 * is no requirement that tokens be unique per user, we re-use tokens for almost
 * their full lifetime of 1 hour, minimizing work.
 *
 * After the initial {@link Promise} returned below by
 * {@link generateEarthEngineToken} resolves, this will always have a resolved
 * {@link Promise}, because {@link generateTokenPeriodically} only sets it when
 * further calls to {@link generateEarthEngineToken} have resolved.
 *
 * @type {Promise<{accessToken: string, expireTime: string}>}
 */
let currentTokenPromise;

/**
 * Pre-fetches token and periodically gets a new one (every 40 minutes, leaving
 * at least 20 minutes of validity for the current token).
 *
 * Only sets {@link currentTokenPromise} after {@link generateEarthEngineToken}
 * promise resolves, so that web requests that come in during refresh don't have
 * to wait, they can just use the old token.
 */
function generateTokenPeriodically() {
  googleCredentialsPresent.then(generateEarthEngineToken)
      .then((token) => currentTokenPromise = Promise.resolve(token));
  setTimeout(generateTokenPeriodically, TIME_BEFORE_REGENERATION);
}

// Cope with slight differences between ESM/Node transpilation of googleapis.
const googleAuth = GoogleAuth.default || GoogleAuth;

// Can't do anything more without credentials being present.
googleCredentialsPresent.then(() => {
  setTimeout(generateTokenPeriodically, TIME_BEFORE_REGENERATION);

  currentTokenPromise = generateEarthEngineToken();

  const client = new googleAuth.OAuth2Client(CLIENT_ID);

  /**
   * See
   * https://nodejs.org/api/http.html#http_http_createserver_options_requestlistener
   * or https://www.w3schools.com/nodejs/nodejs_http.asp for a gentle intro.
   */
  createServer(async (req, res) => {
    const origin = req.headers['origin'];
    if (!allowedOrigins.has(origin)) {
      fail(res);
      return;
    }

    try {
      const {idToken} = await parseBody(req);
      await client.verifyIdToken({idToken: idToken, audience: CLIENT_ID});
    } catch (err) {
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
  }).listen(port);
});

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
