export {
  eeLegacyPathPrefix,
  eeLegacyPrefix,
  eeStatePrefixLength,
  gdEePathPrefix,
  gdEeStateDir,
  gdEeStatePrefix,
  legacyStateDir,
  legacyStatePrefix,
};

const gdEePathPrefix = 'users/gd/';
const eeLegacyPrefix = 'projects/earthengine-legacy/assets/';
const eeLegacyPathPrefix = eeLegacyPrefix + gdEePathPrefix;
const legacyStateDir = eeLegacyPathPrefix + 'states';
const legacyStatePrefix = legacyStateDir + '/';
const gdEeStateDir = gdEePathPrefix + 'states';
const gdEeStatePrefix = gdEeStateDir + '/';
const eeStatePrefixLength = gdEeStatePrefix.length;
