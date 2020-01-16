/**
 * **MANDATORY**
 * This is the google account of the single privileged user who is allowed
 * to use the management pages (manage layers and manage disaster).
 */
const OWNER = 'gd-earthengine-user@givedirectly.org';

/**
 * **OPTIONAL**
 * This is the contact point to which we redirect users if they're having
 * authentication problems. If set to the empty string ('') will default to
 * {@link OWNER} above.
 */
const CONTACT = 'technology.manager@givedirectly.org';

/**
 * **OPTIONAL**
 * This is the list of origins from which the token server is allowed to
 * process requests. By default set to the github pages domain for GiveDirectly.
 */
const TOKEN_SERVER_ORIGINS = ['https://givedirectly.github.io'];

export {OWNER, CONTACT, TOKEN_SERVER_ORIGINS};
