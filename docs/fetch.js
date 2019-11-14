export {TolerantImageMapType};

const TOO_MANY_REQUESTS_STATUS_CODE = 429;
const NOT_FOUND_STATUS_CODE = 404;
const MAX_RETRIES = 10;

function pause(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

class ErrorObject {
  constructor(statusCode, message, url) {
    this.statusCode = statusCode;
    this.message = message;
    this.url = url;
  }

  getMessage() {
    return 'Could not retrieve ' + this.url + (this.message ? ' (' + this.message + ')' : '');
  }
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
      return makeError(response, url);
    }
  }
  return makeError(response, url);
}

function makeError(response, url) {
  return new ErrorObject(response.status, response.statusText, url);
}

function makeErrorMessage(text, url) {
  return 'Could not retrieve ' + url + (text ? ' (' + text + ')' : '');
}

class TolerantImageMapType {
    constructor(tileUrls) {
      this.tileUrls = tileUrls;
      this.tileSize = new google.maps.Size(256, 256);
      this.maxZoom = 15;
    }

    getTile(tileCoord, zoom, ownerDocument) {
      // Create the image in the document.
      const tileDiv = ownerDocument.createElement('div');
      // If validation fails, return an empty tile immediately.
      const maxCoord = 1 << zoom;
      if (zoom < 0 || tileCoord.y < 0 || tileCoord.y >= maxCoord) {
        return tileDiv;
      }
      const tileUrls = this.tileUrls.map((url) => url.replace('{Z}', zoom).replace('{X}', tileCoord.x).replace('{Y}', tileCoord.y));
      Promise.all(tileUrls.map((url) => fetchWithBackoff(url)))
          .then((urls) => {
            let success = false;
            for (let i = 0; i < urls.length; i++) {
              const url = urls[i];
              if (url instanceof ErrorObject) {
                if (url.statusCode !== NOT_FOUND_STATUS_CODE) {
                  console.error(e.statusCode, e.getMessage())
                }
              } else {
                const img = ownerDocument.createElement('img');
                img.src = url;
                img.opacity = 1;
                img.style.position = 'absolute';
                img.style['z-index'] = i;
                tileDiv.appendChild(img);
                success = true;
              }
            }
            google.maps.event.trigger(tileDiv, 'load');
          });
      // Return the image div
      return tileDiv;
    }
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
