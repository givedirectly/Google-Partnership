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

/**
 * EarthEngine path to score asset.
 *
 * This asset may be absent while it is being created. If a previous version of
 * the asset was created, it will be present under {@link getBackupScoreAsset}.
 * Therefore, this function should only be called when creating the score asset
 * and inside run.js when constructing the score asset promise. Naively calling
 * it could result in errors during the time when the score asset is being
 * updated.
 * @return {string}
 */
function getScoreAsset() {
  // TOOD(janakr): rename this path.
  return gdEePathPrefix + getDisaster() + '/data-ms-as-tot';
}

/**
 * EarthEngine path to most recently created score asset before current one.
 * Not needed unless there is no asset at the path of {@link getScoreAsset}.
 * @return {string}
 */
function getBackupScoreAsset() {
  return gdEePathPrefix + getDisaster() + '/score-asset-previous-version';
}

/** The default disaster. */
const defaultDisaster = '2017-harvey';
