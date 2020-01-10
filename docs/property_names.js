export {
  damageTag,
  geoidTag,
  isUserProperty,
  povertyHouseholdsTag,
  scoreTag,
  totalHouseholdsTag,
};

const damageTag = 'DAMAGE PERCENTAGE';
const geoidTag = 'GEOID';
const scoreTag = 'SCORE';
// TODO(janakr): We need some kind of "totals" tags to enable polygon selection
//  in the flexible disaster case, but they should probably be optional.
const povertyHouseholdsTag = 'SNAP HOUSEHOLDS';
const totalHouseholdsTag = 'TOTAL HOUSEHOLDS';

function isUserProperty(name) {
  return !name.startsWith('system:');
}
