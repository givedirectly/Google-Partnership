export {
  blockGroupTag,
  buildingCountTag,
  damageTag,
  geoidTag,
  incomeTag,
  scoreTag,
  snapPercentageTag,
  snapPopTag,
  sviTag,
  totalPopTag,
  tractTag,
};

const blockGroupTag = 'BLOCK GROUP';
const tractTag = 'TRACT';
const damageTag = 'DAMAGE PERCENTAGE';
const geoidTag = 'GEOID';
const scoreTag = 'SCORE';
const snapPercentageTag = 'SNAP PERCENTAGE';
// TODO(ruthtalbot): Does GD actually want these totals surfaced?
const snapPopTag = 'SNAP HOUSEHOLDS';
const totalPopTag = 'TOTAL HOUSEHOLDS';
const buildingCountTag = 'BUILDING COUNT';
// Median household income in the past 12 months (in 2016 inflation-adjusted
// dollars)
const incomeTag = 'MEDIAN INCOME';
const sviTag = 'SVI';
