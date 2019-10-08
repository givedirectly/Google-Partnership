// This script is loaded by Mocha before it runs any unit tests (because we pass
// it beforehand on the command line in mocha.opts). We can do global setup for
// unit tests here as a result. We don't do this in the overall setup.js file
// because the "window" global really confuses the genuine firebase library,
// which is used in integration_tests/polygon_draw_test.js. Putting this
// after that test enables it to run successfully.
import {JSDOM} from 'jsdom';

import ee from './lib/mock_ee';
import firebase from './lib/mock_firebase';
import deck from './lib/mock_deck';

global.dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
