export {createError as default};

/**
 * Simple function that returns a lambda to print an error to console.
 *
 * @param {string} message
 * @return {Function}
 */
function createError(message) {
  // TODO(janakr): use some standard error library?
  return (error) => console.error('Error ' + message + ': ' + error);
}
