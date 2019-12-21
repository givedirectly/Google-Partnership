export {CLIENT_ID, getMillisecondsToDateString};

// The client ID from
// https://console.cloud.google.com/apis/credentials?project=mapping-crisis
const CLIENT_ID =
    '38420505624-boghq4foqi5anc9kc5c5tsq82ar9k4n0.apps.googleusercontent.com';

/**
 * Given a string representation of a future time (in some format parsed by
 * {@link Date}, return the number of milliseconds from now until then.
 * @param {string} dateAsString
 * @return {number} Number of milliseconds until time given by `dateAsString`
 */
function getMillisecondsToDateString(dateAsString) {
  return Date.parse(dateAsString) - Date.now();
}
