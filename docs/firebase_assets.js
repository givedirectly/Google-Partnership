export {firebaseAssets, initializeFirebaseAssets};

// The collection of firebase assets.
let firebaseAssets;

/**
 * Initialize the var once we receive the assets from firebase.
 * @param {Object} assets
 */
function initializeFirebaseAssets(assets) {
  firebaseAssets = assets;
}