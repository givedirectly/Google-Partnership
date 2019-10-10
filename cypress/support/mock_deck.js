export {deck as default};

const deck = {};

global.deck = deck;

/** Mock GoogleMapsOverlay. */
class GoogleMapsOverlay {
  /** @constructor */
  constructor() {
    this.props = {};
  }

  /**
   * Modifies the props field of this object.
   * @param {Object} props Properties to merge in.
   */
  setProps(props) {
    this.props = {...this.props, ...props};
  }
}

/** Mock GeoJsonLayer. */
class GeoJsonLayer {
  /**
   * @constructor
   * @param {Object} props
   */
  constructor(props) {
    this.props = props;
  }
}

deck.GoogleMapsOverlay = GoogleMapsOverlay;
deck.GeoJsonLayer = GeoJsonLayer;
