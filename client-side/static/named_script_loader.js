import {DocumentLoader} from './document_loader.js';

export {noteBodyLoaded};

// TODO(janakr): download all these scripts locally to pin their version and
// avoid skew in the future.
const scriptUrls = [
  "https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyCFPLkRaN7mhZs1yeCt82K0Osnmrn43NT8",
  "https://unpkg.com/deck.gl@latest/dist.min.js",
  "https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js",
  "https://apis.google.com/js/api.js",
  // TODO(janakr): Switch back to compiled version in production.
  "lib/ee_api_js_debug.js",
  // Eagerly start loading necessary parts of chart.
  ["https://www.gstatic.com/charts/loader.js", () => google.charts.load('current', {packages: ['table', 'controls']})],
  "https://www.gstatic.com/firebasejs/6.3.3/firebase-app.js",
  "https://www.gstatic.com/firebasejs/6.3.3/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/7.2.1/firebase-auth.js",
];

const documentLoader = new DocumentLoader(scriptUrls, './script.js');

function noteBodyLoaded() {
  documentLoader.notePageLoaded();
}
