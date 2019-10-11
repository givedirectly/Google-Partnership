import createError from './create_error.js';
import createMap from './create_map.js';
import {inProduction} from './in_test_util.js';
import run from './run.js';
import {initializeSidebar} from './sidebar.js';

export {map};

// The base Google Map, Initialized lazily to ensure doc is ready
let map = null;

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, Google Map is initialized, and on successful
 * login, EE data is overlayed.
 */
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  // eslint-disable-next-line no-unused-vars
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
      '.apps.googleusercontent.com';
  // TODO(#13): This is from juliexxia's console. Should use one for
  // GiveDirectly. Also, this client id has not been properly configured yet.
  // const CLIENT_ID =
  // '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';

  google.charts.load('current', {packages: ['table', 'controls']});

  $(document).ready(function() {
    initializeSidebar();

    map = createMap();

    const runOnSuccess = function() {
      ee.initialize(
          /* opt_baseurl=*/ null, /* opt_tileurl=*/ null, () => run(map),
          createError('initializing EE'));
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

    if (inProduction()) {
      // Attempt to authenticate using existing credentials.
      ee.data.authenticate(
          CLIENT_ID, runOnSuccess, createError('authenticating'), null,
          onImmediateFailed);
    } else {
      // TODO(#21): have something better for tests.
      runOnSuccess();
    }
  });
}

setup();
