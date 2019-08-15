export {createEeConstants as default};

/**
 * Create ee constants that are used across files. We can't create them as
 * top level consts because ee won't work before authentification.
 */
function createEeConstants() {
  const eeConstants = {};
  eeConstants.zero = ee.Number(0);
  eeConstants.joinedSnap =
      ee.FeatureCollection('users/janak/texas-snap-join-damage-with-buildings');
  eeConstants.scalingFactor = ee.Number(100);
  return eeConstants;
}