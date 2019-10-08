// Test helper that sets the global variable ee. Tests can add attributes to the
// exported ee if they wish.
export {ee as default};

const ee = {};

global.ee = ee;

ee.Geometry = {};
ee.Geometry.Point = () => new Point();

ee.Feature = (geometry, properties) => new Feature(geometry, properties);

ee.FeatureCollection = (url) => new FeatureCollection(url);

ee.listEvaluateCallback = null;

/** A thin stub of ee.Feature. */
class Feature {
  /**
   * @constructor
   * @param {Object} geometry
   * @param {Dictionary} properties
   */
  constructor(geometry, properties) {
    this.geometry = geometry;
    this.properties = properties;
  }

  /**
   * Calls the given callback with a null failure return value.
   * @param {function} callback
   */
  evaluate(callback) {
    callback(this, null);
  }
}

/** A thin stub of ee.FeatureCollection. */
class FeatureCollection {
  /**
   * @constructor
   * @param {string} url
   */
  constructor(url) {
    this.url = url;
  }

  /**
   * Doesn't actually do any filtering, returns same feature collection.
   * @param {ee.Geometry} geometry
   * @return {ee.FeatureCollection}
   */
  filterBounds(geometry) {
    return this;
  }

  /**
   * Returns a basic feature with GEOID of 0.
   * @return {Feature}
   */
  first() {
    return new Feature({id: 0}, {'GEOID': 0});
  }

  /**
   * Returns a "list" that can be evaluated and will store its callback.
   *
   * @return {Object}
   */
  toList() {
    return {evaluate: (callback) => ee.listEvaluateCallback = callback};
  }
}

/** An empty stub of ee.Geometry.Point. */
class Point {
  /** @constructor */
  constructor() {}
}
