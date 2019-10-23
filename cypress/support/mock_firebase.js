const firebaseCollection = {};
const firebaseDb = {
  collection: (name) => firebaseCollection,
};
const firebase = {
  initializeApp: () => {},
  firestore: () => firebaseDb,
};

global.firebase = firebase;

/** Mock firebase.firestore.GeoPoint class. */
class GeoPoint {
  /**
   * Constructor.
   *
   * @param {Number} latitude
   * @param {Number} longitude
   */
  constructor(latitude, longitude) {
    this.latitude = latitude;
    this.longitude = longitude;
  }

  /**
   * Compares for equality.
   * @param {firebase.firestore.GeoPoint} other
   * @return {boolean}
   */
  isEqual(other) {
    return this.latitude === other.latitude &&
        this.longitude === other.longitude;
  }
}

firebase.firestore.GeoPoint = GeoPoint;
