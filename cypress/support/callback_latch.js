export {CallbackLatch};

/**
 * Utility class (currently only needed by tests) that can delay a function from
 * being called until it is told to release it.
 */
class CallbackLatch {
  /** @constructor */
  constructor() {
    this.promise = new Promise((resolve) => this.latch = resolve);
  }

  /**
   * Returns a "delayed callback" that only calls the given callback after
   * {@code release} is called.
   * @param {Function} callback
   * @return {Function} Function that, when called, waits for promise to
   *     complete (performed by {@code release} before calling callback
   */
  delayedCallback(callback) {
    return (...params) => this.promise.then(() => callback(...params));
  }

  /** Releases the delayed callback to be called. */
  release() {
    this.latch();
  }
}
