// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)
//
module.exports = (on, config) => {
  on('before:browser:launch', (browser = {}, args) => {
    if (browser.name === 'chromium') {
      const newArgs = args.filter((arg) => (arg !== '--disable-gpu' && arg !== '--start-maximized'));
      newArgs.push('--ignore-gpu-blacklist');
      // throw new Error(newArgs);
      return newArgs;
    }
  });
};
