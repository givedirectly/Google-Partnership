export {
  DEFAULT_DISASTER
}

/**
 * The default disaster that will show up the very first time a user visits
 * the web app. In order to update which disaster users land on the first time,
 * update the string below and commit to the github repository. The string
 * should always be in <year>-<name> format (with the name being all lowercase).
 *
 * After the first time, we locally store the last disaster they were on
 * and always reopen that one.
 */
const DEFAULT_DISASTER = '2017-harvey';
