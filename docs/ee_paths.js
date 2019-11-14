export {gdEePathPrefix, eeLegacyPathPrefix, legacyStateDir, eeStatePrefixLength, gdEeStatePrefix, gdEeStateDir, legacyStatePrefix};

const gdEePathPrefix = 'users/gd/';
const eeLegacyPathPrefix =
    'projects/earthengine-legacy/assets/' + gdEePathPrefix;
const legacyStateDir = eeLegacyPathPrefix + 'states';
const legacyStatePrefix = legacyStateDir + '/';
const gdEeStateDir = gdEePathPrefix + 'states';
const gdEeStatePrefix = gdEeStateDir + '/';
const eeStatePrefixLength = gdEeStatePrefix.length;