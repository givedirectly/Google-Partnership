export {getMillisecondsToDateString};

/**
 * Given a string representation of a future time (in some format parsed by
 * {@link Date}, return the number of milliseconds from now until then.
 * @param {string} dateAsString
 * @return {number} Number of milliseconds until time given by `dateAsString`
 */
function getMillisecondsToDateString(dateAsString) {
  return Date.parse(dateAsString) - Date.now();
}
