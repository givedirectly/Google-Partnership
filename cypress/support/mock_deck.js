export {deck as default};

const deck = {};

global.deck = deck;

class GoogleMapsOverlay {
  constructor() {
    this.props = {};
  }

  setProps(props) {
    this.props = {...this.props, ...props};
  }
}

class GeoJsonLayer {
  constructor(props) {
    this.props = props;
  }
}

deck.GoogleMapsOverlay = GoogleMapsOverlay;
deck.GeoJsonLayer= GeoJsonLayer;

