export {TolerantImageMapType, setUpTolerantImageMapType};

const TOO_MANY_REQUESTS_STATUS_CODE = 429;
const NOT_FOUND_STATUS_CODE = 429;
const MAX_RETRIES = 10;

function pause(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function fetchWithBackoff(url, options) {
  let retryCount = 0;
  let response;
  while (retryCount++ < MAX_RETRIES) {
    response = fetch(url, options);
    if (response.ok === true) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    if (response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
      await pause(1000 * Math.pow(2, retryCount));
    } else {
      makeAndThrowError(response);
    }
  }
  makeAndThrowError(response);
}

function makeAndThrowError(response) {
  const error = new Error(response.status + ': ' + makeErrorMessage(response.statusText));
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
      super(options);
    }

    getTile(tileCoord, zoom, ownerDocument) {
      // Create the image in the document.
      const tileDiv = ownerDocument.createElement('img');
      // If validation fails, return an empty tile immediately.
      const maxCoord = 1 << zoom;
      if (zoom < 0 || tileCoord.y < 0 || tileCoord.y >= maxCoord) {
        return tileDiv;
      }
      fetchWithBackoff(this.getTileUrl(tileCoord, zoom))
          .then((url) => {
            tileDiv.src = url;
            tileDiv.style.opacity = this.getOpacity();
            google.maps.event.trigger(tileDiv, 'load');
          })
          .catch((e) => {
            if (e.statusCode !== NOT_FOUND_STATUS_CODE) {
              console.error(e);
            }
          });
      // Return the image div
      return tileDiv;
    }
  };
}
