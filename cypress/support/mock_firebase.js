export {firebaseCollection as default};

export const firebaseCollection = {};
const firebaseDb = {
  collection: (name) => firebaseCollection
};
const firebase = {
  initializeApp: () => {},
  firestore: () => firebaseDb
};

global.firebase = firebase;

class GeoPoint {
  constructor(latitude, longitude) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
}

firebase.firestore.GeoPoint = GeoPoint;