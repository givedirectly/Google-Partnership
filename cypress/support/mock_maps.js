export {google as default};

const google = {};

global.google = google;

google.maps = {};

google.maps.InfoWindow = () => new InfoWindow();

google.maps.LatLng = () => new LatLng();

/** A thin stub of google.maps.InfoWindow */
class InfoWindow {
  constructor() {};

  setContent(div) {};

  close() {};

  setPosition(latlng) {};

  open() {};
}

class LatLng {
  constructor(lat, lng) {
    this.lat = lat;
    this.long = lng;
  }
}