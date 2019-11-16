export {CompositeImageMapType};

const TOO_MANY_REQUESTS_STATUS_CODE = 429;
const NOT_FOUND_STATUS_CODE = 404;
const MAX_RETRIES = 10;

// TODO(janakr): figure out how to set loading progress indicators for this
//  class. Easiest way might just be to add a loading indicator for every tile
//  requested and remove for every tile produced. Not sure how that interacts
//  with zooming in the middle of rendering, though.
/**
 * Custom google.maps.MapType implementation that overlays multiple tiles from
 * different sources, so that they can all be treated as a single overlay.
 */
class CompositeImageMapType {
  /**
   * @constructor
   * @param {Object} options Options: should have tileUrls attribute (list of
   *     urls with {X}, {Y}, and {Z} placeholders for coordinates and zoom). May
   *     also have tileSize (width of each tile in pixels, defaults to 256),
   *     maxZoom (maximum zoom level to try to fetch tiles for, defaults to 19),
   *     and opacity (opacity of rendered tiles, defaults to 1, totally opaque)
   */
  constructor(options) {
    this.tileUrls = options.tileUrls;
    this.opacity = options.opacity ? options.opacity : 1;

    // this.tileSize and this.maxZoom are read directly by Google Maps.
    const size = options.tileSize ? options.tileSize : 256;
    this.tileSize = new google.maps.Size(size, size);
    this.maxZoom = options.maxZoom ? options.maxZoom : 19;
  }

  /**
   * Returns the tile for the given coordinates and zoom level. Tile will be a
   * div with stacked images, one for each successfully loaded from tileUrls.
   * @param {google.maps.Point} tileCoord coordinates for tile
   * @param {number} zoom integer zoom level
   * @param {Document} ownerDocument document that HTML elements will be created
   *     in
   * @return {HTMLDivElement} div element with tile images attached
   */
  getTile(tileCoord, zoom, ownerDocument) {
    // Create a div to hold all the images.
    const tileDiv = ownerDocument.createElement('div');
    if (zoom > this.maxZoom) {
      return tileDiv;
    }
    // Replace tile url template arguments with actual coordinates.
    const tileUrls = this.tileUrls.map(
        (url) => url.replace('{Z}', zoom)
                     .replace('{X}', tileCoord.x)
                     .replace('{Y}', tileCoord.y));
    Promise.all(tileUrls.map(fetchWithBackoff)).then((urls) => {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (url instanceof ErrorObject) {
          if (url.statusCode !== NOT_FOUND_STATUS_CODE) {
            console.error(e.statusCode, e.getMessage());
          }
          continue;
        }
        const img = ownerDocument.createElement('img');
        img.src = url;
        img.opacity = this.opacity;
        // Stack images over each other, later ones on top.
        img.style.position = 'absolute';
        img.style['z-index'] = i;
        tileDiv.appendChild(img);
      }
      google.maps.event.trigger(tileDiv, 'load');
    });
    return tileDiv;
  }

  releaseTile(div) {
    for (const child of div.children) {
      URL.revokeObjectURL(child.src);
    }
  }
}

/**
 * Wrapper object for HTML errors encountered during a single tile fetch, to
 * avoid throwing errors that would shut down other tile fetches.
 */
class ErrorObject {
  /**
   * @constructor
   * @param {number} statusCode HTTP status code (like 404, 400, 429)
   * @param {string} message Error message from HTTP response
   * @param {string} url Original URL requested for fetch
   */
  constructor(statusCode, message, url) {
    this.statusCode = statusCode;
    this.message = message;
    this.url = url;
  }

  /**
   * @return {string} Formatted error message from this error, for console
   *     display
   */
  getMessage() {
    return 'Could not retrieve ' + this.url +
        (this.message ? ' (' + this.message + ')' : '');
  }
}

ErrorObject.create = (response, url) => {
  return new ErrorObject(response.status, response.statusText, url);
};

/**
 * Performs an HTTP fetch, but with exponential backoff if the server responds
 * with a "too many requests" error. Return errors as an ErrorObject to avoid
 * aborting sibling fetchWithBackoff requests that are part of the same
 * Promise.all() task.
 * @param {string} url URL to fetch
 * @return {Promise<string>|ErrorObject} Promise with local object URL for
 *     fetched data, or ErrorObject if an error was encountered
 */
async function fetchWithBackoff(url) {
  let retryCount = 0;
  let response;
  const exponentialBackoff = new ExponentialBackoff();
  while (retryCount++ < MAX_RETRIES) {
    response = await fetch(url);
    if (response.ok === true) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    if (response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
      await exponentialBackoff.wait();
    } else {
      return ErrorObject.create(response, url);
    }
  }
  return ErrorObject.create(response, url);
}

/** Utility class to wait an exponentially increasing amount of time. */
class ExponentialBackoff {
  /** @constructor */
  constructor() {
    this.retryCount = 0;
  }

  /**
   * @return {Promise<void>} Promise that is fulfilled after a random sleep of
   *     at most 2^(this.retryCount) seconds
   */
  async wait() {
    const maxSleep = 1000 * Math.pow(2, ++this.retryCount);
    // Use random jitter to avoid all of our requests synchronizing on the
    // server (and hammering the client event loop).
    await pause(Math.random() * maxSleep);
  }
}

/**
 * @param {number} duration milliseconds to pause
 * @return {Promise<void>} Promise that resolves after {@code duration}
 *     milliseconds
 */
function pause(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
