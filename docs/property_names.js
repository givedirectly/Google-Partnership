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
//  Alternately, change these names to be a bit more generic:
//  'POVERTY PERCENTAGE' and similar. Then GD can just transform their asset to
//  have these properties. That does make table a bit generic, though: helpful
//  to have some indication where percentage comes from.
const povertyPercentageTag = 'SNAP PERCENTAGE';
// TODO(ruthtalbot): Does GD actually want these totals surfaced?
const povertyHouseholdsTag = 'SNAP HOUSEHOLDS';
const totalHouseholdsTag = 'TOTAL HOUSEHOLDS';
