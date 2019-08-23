// Test helper that sets the global variable ee. Tests can add attributes to the
// exported ee if they wish.
export {ee as default};

const ee = {};

global.ee = ee;
ee.Number = (num) => new EeNumber(num);
ee.List = (list) => new List(list);

// From now on not actually needed for basic initialization: could be done
// in a function.

ee.Dictionary = (dict) => new Dictionary(dict);
ee.Dictionary.fromLists = (keys, values) => {
  const map = new Map();
  for (let i = 0; i < keys.list.length; i++) {
    map.set(keys.list[i], values[i]);
  }
  return new Dictionary(map);
};

ee.Algorithms = {};
ee.Algorithms.If = (cond, ifTrue, ifFalse) => {
  return cond ? ifTrue : ifFalse;
};

ee.Reducer = {};
ee.Reducer.sum = () => sumMarker;

ee.Feature = (geometry, properties) => new Feature(geometry, properties);

ee.FeatureCollection = (url) => new FeatureCollection(url);

ee.MapLayerOverlay = (url, mapId, token, init) => new MapLayerOverlay();

const sumMarker = {
  'sum': true,
};

/**
 * Returns true if obj is an EeNumber.
 *
 * @param {Object} obj
 * @return {boolean}
 */
function isEeNumber(obj) {
  return getTypeOf(obj) === eeNumberString;
}

/**
 * Returns a string corresponding to the type.
 *
 * @param {Object} obj
 * @return {string}
 */
function getTypeOf(obj) {
  return Object.prototype.toString.call(obj);
}

/** A thin stub of ee.Number. */
class EeNumber {
  /**
   * Constructor.
   * @param {Object} value Either another EeNumber, an ordinary number, or
   *     assumed to be 0.
   * @return {EeNumber}
   */
  constructor(value) {
    if (isNaN(value)) {
      if (isEeNumber(value)) {
        return value;
      }
      this._myNumberValue = 0;
    } else {
      this._myNumberValue = value;
    }
  }

  /**
   * Multiplies this value by value. Returns the product.
   *
   * @param {EeNumber|number} value
   * @return {EeNumber}
   */
  multiply(value) {
    if (isEeNumber(value)) {
      value = value._myNumberValue;
    }
    return new EeNumber(this._myNumberValue * value);
  }

  /**
   * Divides this value by value. Returns the result.
   *
   * @param {EeNumber|number} value
   * @return {EeNumber}
   */
  divide(value) {
    if (isEeNumber(value)) {
      value = value._myNumberValue;
    }
    return new EeNumber(this._myNumberValue / value);
  }

  /**
   * Returns if this value is <= the given value.
   *
   * @param {number} value
   * @return {boolean}
   */
  lte(value) {
    return this._myNumberValue <= value;
  }

  /**
   * Rounds this value.
   *
   * @return {EeNumber}
   */
  round() {
    return new EeNumber(Math.round(this._myNumberValue));
  }

  /**
   * Returns the minimum of this value and num.
   *
   * @param {EeNumber} num
   * @return {EeNumber}
   */
  min(num) {
    return this._myNumberValue <= num._myNumberValue ? this : num;
  }

  /**
   * Formats this value using formatString, which must be 'ff00ff%02d'.
   *
   * @param {string} formatString
   * @return {string}
   */
  format(formatString) {
    if (formatString === 'ff00ff%02d') {
      return 'ff00ff' + (this._myNumberValue < 10 ? '0' : '') +
          this._myNumberValue;
    } else {
      throw new Error('Format strings other than \'ff00ff%02d\' not supported');
    }
  }
}

const eeNumberString = getTypeOf(new EeNumber(0));

/** A thin stub of ee.List. */
class List {
  /**
   * Constructor.
   *
   * @param {array} list
   */
  constructor(list) {
    this.list = list;
  }

  /**
   * Wrapper for Array.map.
   *
   * @param {Object} lambda a function to be applied to each element of the list
   * @return {List}
   */
  map(lambda) {
    return new List(this.list.map(lambda));
  }

  /**
   * Sum elements of the list.
   *
   * @param {Object} reducer must equal sumMarker.
   * @return {number} the sum of the elements in the list.
   */
  reduce(reducer) {
    if (reducer === sumMarker) {
      return this.list.reduce(
          (total, currentValue) => total + currentValue._myNumberValue, 0);
    } else {
      throw new Error('Non-sum reducers not supported');
    }
  }
}

const mapString = getTypeOf(new Map());

/**
 * Returns true if obj is a Javascript Map.
 *
 * @param {Object} obj
 * @return {boolean}
 */
function isMap(obj) {
  return getTypeOf(obj) === mapString;
}

/** A thin stub of ee.Dictionary. */
class Dictionary {
  /**
   * Constructor.
   *
   * @param {Object|Array} dict Either a Javascript map or an array. If an
   *     array, has each key followed by each value.
   */
  constructor(dict) {
    if (isMap(dict)) {
      this.dict = dict;
    } else {
      this.dict = new Map();
      for (let i = 0; i < dict.length; i += 2) {
        this.dict.set(dict[i], dict[i + 1]);
      }
    }
  }

  /**
   * Wrapper around Map.get.
   *
   * @param {Object} key
   * @return {Object} value associated with key
   */
  get(key) {
    return this.dict.get(key);
  }

  /**
   * Wrapper around Map.set.
   *
   * @param {Object} key
   * @param {Object} value
   */
  set(key, value) {
    this.dict.set(key, value);
  }
}

/** A thin stub of ee.Feature. */
class Feature {
  /**
   * Constructor.
   *
   * @param {Object} geometry
   * @param {Dictionary} properties
   */
  constructor(geometry, properties) {
    this.geometry = geometry;
    this.properties = properties;
  }

  /**
   * Sets the properties in newProperties in this feature.
   *
   * @param {Object} newProperties
   * @return {Feature} this object.
   */
  set(newProperties) {
    const keys = Object.keys(newProperties);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      this.properties.set(key, newProperties[key]);
    }
    return this;
  }
}

ee.callback = null;

/** A thin stub of ee.FeatureCollection. */
class FeatureCollection {
  /**
   * Constructor.
   *
   * @param {string} url
   */
  constructor(url) {
    this.url = url;
  }

  /**
   * Accepts a callback param as expected and calls it with nonsense vars.
   *
   * @param {Dictionary} args
   */
  getMap(args) {
    ee.callback = args['callback'];
  }
}

/** An empty stub of ee.MapLayerOverlay. */
class MapLayerOverlay {
  /**
   * Constructor.
   */
  constructor() {}
}
