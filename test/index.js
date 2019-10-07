// This script is loaded by Mocha before it runs any tests (because we pass it
// on the command line in mocha.opts). We can do global setup here as a result.
import {expect} from 'chai';
import {setUp, loadPage} from "./lib/test_support";

global.expect = expect;
global.setUp = setUp;
global.loadPage = loadPage;

global.tableClass = 'google-visualization-table-table';
