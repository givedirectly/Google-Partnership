// This script is loaded by Mocha before it runs any tests (because we pass it
// on the command line in mocha.opts). We can do global setup here as a result.
import {expect} from 'chai';
import {JSDOM} from 'jsdom';
import {setUp, loadPage} from "./lib/test_support";

import ee from '../cypress/support/mock_ee';
import firebase from '../cypress/support/mock_firebase';

global.expect = expect;
global.setUp = setUp;
global.loadPage = loadPage;
global.dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
