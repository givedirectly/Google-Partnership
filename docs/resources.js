import {gdEePathPrefix} from './ee_paths.js';

export {getBackupScoreAsset, getDisaster, getScoreAsset};

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
  return gdEePathPrefix + getDisaster() + '/data-ms-as-tot';
}

/** @return {string} EE asset path for previously created score asset */
function getBackupScoreAsset() {
  return gdEePathPrefix + getDisaster() + '/score-asset-previous-version';
}

/** The default disaster. */
const defaultDisaster = '2017-harvey';
