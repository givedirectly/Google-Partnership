export {SettablePromise as default};

/**
 * Class that provides a Promise that will be completed when the Promise passed
 * into setPromise is complete. Useful when the Promise you want to wait for
 * will not be created until later.
 *
 * Users can safely call getPromise() before setPromise() has been called: the
 * returned Promise will complete once setPromise() is called and the argument
 * of setPromise() has completed.
 */
class SettablePromise {
  /** @constructor */
  constructor() {
    let resolveFunction = null;
    let rejectFunction = null;
    this.promise = new Promise((resolve, reject) => {
      resolveFunction = resolve;
      rejectFunction = reject;
    });
    this.resolveFunction = resolveFunction;
    this.rejectFunction = rejectFunction;
    this.promiseSet = false;
  }

  /**
   * Sets the Promise to get the value of. Can only be called once.
   * @param {Promise<any>} promise
   */
  setPromise(promise) {
    if (this.promiseSet) {
      console.error('Promise already set: ', this, promise);
      return;
    }
    this.promiseSet = true;
    promise.then(this.resolveFunction).catch(this.rejectFunction);
  }

  /**
   * Returns the Promise that will eventually resolve to the value of the
   * Promise passed into setPromise.
   *
   * @return {Promise<any>}
   */
  getPromise() {
    return this.promise;
  }
}
