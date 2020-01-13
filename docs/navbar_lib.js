import {HELP_DOC_URL, MANAGE_DISASTERS_HELP_URL, MANAGE_LAYERS_HELP_URL} from './help.js';
import {inProduction} from './in_test_util.js';
import {MANAGE_DISASTERS_PAGE, MANAGE_LAYERS_PAGE} from './navbar.js';

export {
  getHelpUrl,
  getUrlUnderDocs,
};

/**
 * Get url of a file in or below our docs directory by using the path of this
 * current script.
 * @param {string} pathFragment path fragment to append to '.../docs/'
 * @return {string}
 */
function getUrlUnderDocs(pathFragment) {
  return import.meta.url.replace(/navbar_lib\.js$/, pathFragment)
}

/**
 * Gets the url for the help section relevant to the current page
 * @return {string}
 */
function getHelpUrl() {
  if (window.location.pathname.endsWith(MANAGE_LAYERS_PAGE)) {
    return MANAGE_LAYERS_HELP_URL;
  } else if (window.location.pathname.endsWith(MANAGE_DISASTERS_PAGE)) {
    return MANAGE_DISASTERS_HELP_URL;
  }
  return HELP_DOC_URL;
}
