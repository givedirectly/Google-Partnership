// Test helper that sets the global variable ee. Tests can add attributes to the
// exported ee if they wish.
export {ee as default};

const ee = {};

global.ee = ee;

ee.Geometry = {};
ee.Geometry.Point = () => new Point();
ee.Geometry.Polygon = () => new Polygon();

ee.Feature = (geometry, properties) => new Feature(geometry, properties);

ee.FeatureCollection = (url) => new FeatureCollection(url);

ee.Join = {};
ee.Join.simple = () => new Join();

ee.Filter = {};
ee.Filter.intersects = (properties) => new Filter();

ee.Number = (value) => new EeNumber(value);

ee.listEvaluateCallback = null;

/**
 * A thin stub of ee.Join
 */
class Join {
  /**
   * @constructor
   */
  constructor() {}

  /**
   * Applies a join that just returns the left table.
   * @param {ee.FeatureCollection} leftTable
   * @param {ee.FeatureCollection} rightTable
   * @param {ee.Filter} filter
   * @return {ee.FeatureCollection}
   */
  apply(leftTable, rightTable, filter) {
    return leftTable;
  }
}

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

  // TODO: Get rid of this mock when we stop using filterBounds
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
   * @return {Object}
   */
  toList() {
    return {evaluate: (callback) => ee.listEvaluateCallback = callback};
  }

  /**
   * Returns size of 1 always.
   * @return {EeNumber}
   */
  size() {
    return new EeNumber(1);
  }
}

/** A thin stub off ee.Number. */
class EeNumber {
  /**
   * @constructor
   * @param {number} value
   */
  constructor(value) {
    this._value = value;
  }

  /**
   * Gives the value supplied at construction as the success parameter to the
   * given callback.
   * @param {function} callback
   */
  evaluate(callback) {
    callback(this._value, null);
  }
}

/** An empty stub of ee.Geometry.Point. */
class Point {
  /** @constructor */
  constructor() {}
}

/** An empty stub of ee.Geometry.Polygon. */
class Polygon {
  /** @constructor */
  constructor() {}
}

/** An empty stub of ee.Filter. */
class Filter {
  /** @constructor */
  constructor() {}
}
