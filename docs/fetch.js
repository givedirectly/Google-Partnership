export {TolerantImageMapType, setUpTolerantImageMapType};

const TOO_MANY_REQUESTS_STATUS_CODE = 429;
const NOT_FOUND_STATUS_CODE = 404;
const MAX_RETRIES = 10;

function pause(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function fetchWithBackoff(url, options) {
  let retryCount = 0;
  let response;
  while (retryCount++ < MAX_RETRIES) {
    response = await fetch(url, options);
    if (response.ok === true) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    if (response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
      await pause(1000 * Math.pow(2, retryCount));
    } else {
      makeAndThrowError(response, url);
    }
  }
  makeAndThrowError(response, url);
}

function makeAndThrowError(response, url) {
  const error = new Error(response.status + ': ' + makeErrorMessage(response.statusText, url));
  error.statusCode = response.status;
  throw error;
}

function makeErrorMessage(text, url) {
  return 'Could not retrieve ' + url + (text ? ' (' + text + ')' : '');
}

let TolerantImageMapType;

function setUpTolerantImageMapType() {
  TolerantImageMapType = class extends google.maps.ImageMapType {
    constructor(options) {
      options.getTileUrl = () => {};
      super(options);
      this.tileUrls = options.tileUrls;
    }

    getTile(tileCoord, zoom, ownerDocument) {
      // Create the image in the document.
      const tileDiv = ownerDocument.createElement('img');
      // If validation fails, return an empty tile immediately.
      const maxCoord = 1 << zoom;
      if (zoom < 0 || tileCoord.y < 0 || tileCoord.y >= maxCoord) {
        return tileDiv;
      }
      const tileUrls = this.tileUrls.map((url) => url.replace('{Z}', zoom).replace('{X}', tileCoord.x).replace('{Y}', tileCoord.y));
      anyPromise(tileUrls.map((url) => fetchWithBackoff(url)))
          .then((url) => {
            tileDiv.src = url;
            tileDiv.style.opacity = this.getOpacity();
            google.maps.event.trigger(tileDiv, 'load');
          })
          .catch((e) => {
            if (e.statusCode !== NOT_FOUND_STATUS_CODE) {
              console.warn(e.statusCode, e);
            }
            return false;
          });
      // Return the image div
      return tileDiv;
    }
  };
}

function anyPromise(promises) {
  return new Promise((resolve, reject) => {
    let hasResolved = false;
    let rejectedCount = 0;
    const promiseThen = (result) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(result);
      }
    };
    const promiseCatch = (error) => {
      if (++rejectedCount === promises.length) {
        reject(error);
      }
    };
    for (const promise of promises) {
      promise.then(promiseThen, promiseCatch);
    }
  });
}
