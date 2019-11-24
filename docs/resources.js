import {gdEePathPrefix} from './ee_paths.js';

export {getDisaster, getScoreAsset};
/**
 * Determines and returns the current disaster.
 * @return {string} current disaster
 */
function getDisaster() {
  if (localStorage.getItem('disaster')) {
    return localStorage.getItem('disaster');
  }
  localStorage.setItem('disaster', defaultDisaster);
  return defaultDisaster;
}

/** @return {string} EE asset path for score asset for the current disaster */
function getScoreAsset() {
  // TODO(janakr): When import script finishes, change this to new path, and
  //  audit code for places that might assume damage is not always 0.
  return gdEePathPrefix + getDisaster() + '/data-ms-as-nod';
}

/** The default disaster. */
const defaultDisaster = '2017-harvey';
