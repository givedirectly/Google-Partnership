export {
  blockGroupTag,
  damageTag,
  geoidTag,
  povertyHouseholdsTag,
  povertyPercentageTag,
  scoreTag,
  totalHouseholdsTag,
};

const blockGroupTag = 'BLOCK GROUP';
const damageTag = 'DAMAGE PERCENTAGE';
const geoidTag = 'GEOID';
const scoreTag = 'SCORE';
// TODO(janakr): Allow user to set the column names for the score ingredient
//  (currently always 'SNAP PERCENTAGE') and population properties (for use with
//  drawing polygons, currently always 'SNAP HOUSEHOLDS' and
//  'TOTAL HOUSEHOLDS'). Then can read these in from Firestore.
const povertyPercentageTag = 'SNAP PERCENTAGE';
// TODO(ruthtalbot): Does GD actually want these totals surfaced?
const povertyHouseholdsTag = 'SNAP HOUSEHOLDS';
const totalHouseholdsTag = 'TOTAL HOUSEHOLDS';
