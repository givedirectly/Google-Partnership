export {loadNavbar};

/**
 * Loads the navbar and sets the title.
 *
 * @param {string} title the title of the navbar
 */
function loadNavbar(title) {
  $(() => {
    $('#navbar').load('/navbar.html', () => $('#nav-header').html(title));
  });
}
