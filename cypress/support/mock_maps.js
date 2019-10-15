export {google as default};

const google = {};

global.google = google;

google.maps = {};

google.maps.InfoWindow = () => new InfoWindow();

google.maps.LatLng = () => new LatLng();

google.maps.event = {clearListeners: () => {}};

/** A thin stub of google.maps.InfoWindow */
class InfoWindow {
  /** @constructor */
  constructor() {};

  /**
   * Takes an HTML element, doesn't do anything with it;
   * @param {HTMLElement} div
   */
  setContent(div) {};

  /** Stub of the close method. */
  close() {};

  /**
   * Takes a position, doesn't do anything with it.
   * @param {google.maps.LatLng} latlng
   */
  setPosition(latlng) {};

  /** Stub of the open method. */
  open() {};
}

/** A very thin stub of google.maps.LatLng */
class LatLng {
  /**
   * @constructor
   * @param {integer} lat
   * @param {integer} lng
   */
  constructor(lat, lng) {
    this.lat = lat;
    this.long = lng;
  }
}
