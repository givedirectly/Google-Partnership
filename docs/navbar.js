export {loadNavbar};

/**
 * Loads the navbar and calls the callback upon load.
 *
 * @param {Function} callback the function called upon load
 */
function loadNavbar(callback) {
  $(() => $('#navbar').load('/navbar.html', callback));
}
