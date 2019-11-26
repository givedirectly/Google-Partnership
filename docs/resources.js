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
  // TODO(janakr): Modify map to handle no-damage scenario more intuitively.
  //  Should make damage threshold, weight 0, probably hide those toggles
  //  completely. Other changes?
  // TODO(janakr): switch back to -as-tot when regenerated, and make a backup
  //  so you don't lose it again.
  return gdEePathPrefix + getDisaster() + '/data-ms-as-nod';
}

/** The default disaster. */
const defaultDisaster = '2017-harvey';
