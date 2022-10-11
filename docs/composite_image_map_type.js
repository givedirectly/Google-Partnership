export {CompositeImageMapType};

const TOO_MANY_REQUESTS_STATUS_CODE = 429;
const NOT_FOUND_STATUS_CODE = 404;
const MAX_RETRIES = 10;

/**
 * Custom google.maps.MapType implementation that overlays multiple tiles from
 * different sources, so that they can all be treated as a single overlay.
 *
 * If a tile is released, any pending fetches are canceled. Callers can register
 * a callback to be informed when loading starts/ends.
 *
 * We use a pretty complex Javascript fetch mechanism, as opposed to a much
 * simpler img.src, because these requests might get 429 (too many requests)
 * errors, and we want to gracefully retry them. There doesn't appear to be any
 * way to gracefully retry 429 errors that come from image loading (that is, the
 * image's onerror handler does not expose that the error was a 429).
 *
 * TODO(janakr): Google Crisis Maps doesn't appear to have any retry capability,
 *  and they are using these same NOAA tiles. Maybe not worth the complexity
 *  here to retry 429?
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
    /**
     * Holds the AbortController for the image downloads of each div tile. Once
     * all fetches complete for a given div, it is removed from this map. Hence
     * the size of this map is the number of tiles currently in flight. We fire
     * an event when this map goes from empty to non-empty (indicating that this
     * layer has started loading) and when this map goes from non-empty to empty
     * (indicating that loading is complete). Depending on the vagaries of when
     * Google Maps requests tiles, it is possible that only some tiles might be
     * requested, they would complete, and then more tiles would be requested,
     * leading to a stuttering loading indicator, but in practice this does not
     * happen, because Google Maps requests all of the relevant tiles at once.
     * @type {Map<HTMLDivElement, AbortController>}
     */
    this.tileMap = new Map();
    this.eventTarget = new EventTarget();

    // this.tileSize and this.maxZoom are read directly by Google Maps.
    const size = options.tileSize ? options.tileSize : 256;
    this.tileSize = new google.maps.Size(size, size);
    // NOAA tile imagery seems to go up to zoom level 19.
    this.maxZoom = options.maxZoom ? options.maxZoom : 19;
  }

  /**
   * Sets a callback to be notified. The callback will receive an {@link Event}
   * with a "count" attribute which is either 0 or 1, patterned after the
   * {@link ee.TileEvent} event, so that callers can use the same callback.
   * However, these events are only emitted for the first tile requested and
   * last tile generated, not for every tile, unlike {@link ee.TileEvent}.
   *
   * Any previous registered callback is removed when this is called.
   * @param {Function} callback
   */
  setTileCallback(callback) {
    if (this.callback) {
      this.eventTarget.removeEventListener('tile', this.callback);
    }
    this.callback = callback;
    this.eventTarget.addEventListener('tile', callback);
  }

  /**
   * Returns the tile for the given coordinates and zoom level. Tile will be a
   * div with stacked images, one for each successfully loaded from tileUrls.
   * @param {google.maps.Point} tileCoord coordinates for tile
   * @param {number} zoom integer zoom level
   * @param {Document} ownerDocument document HTML elements will be created in
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
        // Case-insensitive match (i), replace global (g)
        (url) => url.replace(/{Z}/ig, zoom)
                     .replace(/{X}/ig, tileCoord.x)
                     .replace(/{Y}/ig, tileCoord.y));
    // Set things up to cancel all fetches if this tile is no longer needed, as
    // signaled by #releaseTile below.
    const abortController = new AbortController();
    const signal = abortController.signal;
    this.maybeSendEvent(true);
    this.tileMap.set(tileDiv, abortController);
    let remainingTiles = tileUrls.length;
    // Process each image as it comes in, so user can see latest images without
    // waiting for slow-loading ones.
    const promiseProcessor = (url) => {
      // If releaseTile() was called for this tile before this promise
      // completed, we are aborting.
      if (!this.tileMap.get(tileDiv)) {
        if (typeof (url) === 'string') {
          // If the image was already downloaded, free it.
          URL.revokeObjectURL(url);
        }
        return;
      }
      if (typeof (url) === 'string') {
        this.appendImage(url, tileDiv);
      } else if (url instanceof ErrorObject) {
        if (url.statusCode !== NOT_FOUND_STATUS_CODE) {
          console.error(url.statusCode, url.getMessage());
        }
      }
      if (!--remainingTiles) {
        // All fetches have completed, maybe some with errors. Tile is done.
        this.markTileCompleted(tileDiv);
      }
    };
    tileUrls.map((url) => fetchWithBackoff(url, signal).then(promiseProcessor));
    return tileDiv;
  }

  /**
   * Implements MapType#releaseTile. Revokes local object URL for all images in
   * the given div, freeing up memory, and canceling any in-flight fetches.
   * @param {HTMLDivElement} div
   */
  releaseTile(div) {
    const controller = this.tileMap.get(div);
    if (controller) {
      controller.abort();
      this.markTileCompleted(div);
    }
  }

  /**
   * Creates and appends an HTMLImageElement pointing at the given url. When the
   * image is loaded, the url (which points at a local object) will be freed to
   * save memory.
   * @param {string} url URL from {@link URL#createObjectURL}
   * @param {HTMLDivElement} tileDiv Div to attach image to.
   */
  appendImage(url, tileDiv) {
    const img = tileDiv.ownerDocument.createElement('img');
    img.src = url;
    img.opacity = this.opacity;
    // Stack images over each other.
    img.style.position = 'absolute';
    // Clear blob from memory as soon as it is loaded.
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => img.style.display = 'none';
    tileDiv.appendChild(img);
  }

  /**
   * Removes div from {@link this#tileMap} and sends an event if no tiles remain
   * to be rendered.
   * @param {HTMLDivElement} div
   */
  markTileCompleted(div) {
    this.tileMap.delete(div);
    this.maybeSendEvent(false);
  }

  /**
   * If we are transitioning from no pending fetches to pending fetches or vice
   * versa, send an event.
   * @param {boolean} adding True if we are about to start a fetch, false if we
   *     have just finished all fetches
   */
  maybeSendEvent(adding) {
    if (!this.tileMap.size) {
      const event = new Event('tile');
      event.loadingTileCount = adding ? 1 : 0;
      this.isAdding = adding;
      this.eventTarget.dispatchEvent(event);
    }
  }

  /**
   * Function to copy EarthEngine ImageOverlay interface to indicate if tiles
   * have just started fetching (non-zero loading count) or just finished.
   * @return {number} 1 if tile loading is started, 0 if finished.
   */
  getLoadingTilesCount() {
    return this.isAdding ? 1 : 0;
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
 * with a "too many requests" error. Return response errors as an ErrorObject
 * for ease of processing.
 * @param {string} url URL to fetch
 * @param {AbortSignal} signal Signal to pass to fetch to trigger abort
 * @return {Promise<!string|ErrorObject>} Promise with local object URL for
 *     fetched data, or ErrorObject if an error was encountered, or null if
 * aborted by signal
 */
async function fetchWithBackoff(url, signal) {
  let retryCount = 0;
  let response;
  const exponentialBackoff = new ExponentialBackoff();
  while (retryCount++ < MAX_RETRIES) {
    try {
      response = await fetch(url, {signal: signal});
      if (response.ok === true) {
        const blob = await response.blob();
        if (blob.type == 'text/html') {
          // Filter out "404 not found" error pages that nominally returned "ok"
          // in the response. Type of images should be 'binary/octet-stream',
          // definitely not text.
          return null;
        }
        return URL.createObjectURL(blob);
      }
      if (response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
        await exponentialBackoff.wait();
      } else {
        return ErrorObject.create(response, url);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return null;
      }
      throw err;
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
