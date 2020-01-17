/**
 * This is the list of origins from which the token server is allowed to
 * process requests. Only necessary if you'd like to set up a token server
 * to allow users to bypass the need for earth engine whitelisting. By default
 * set to the github pages domain for GiveDirectly.
 */
const TOKEN_SERVER_ORIGINS = ['https://givedirectly.github.io'];

export {TOKEN_SERVER_ORIGINS};
