export {highlightFeature as default};

/**
 * Takes an EE feature and displays its geometry on the Google Maps API map.
 *
 * @param {ee.Feature} feature
 * @param {google.maps.Map} map
 */
function highlightFeature(feature, map) {
  feature.geometry().evaluate(function(geo, failure) {
    if (geo) {
      const jsonGeometry = JSON.parse(ee.Geometry(geo).toGeoJSONString());
      // This is a JSON object representing a Google Maps API feature.
      const feature = {'type': 'Feature', 'geometry': jsonGeometry};
      map.data.addGeoJson(feature).forEach(
          (item) => map.data.overrideStyle(
              item, {fillColor: 'red', strokeColor: 'red'}));
    } else {
      console.error('Error retrieving geometry: ', failure);
    }
  });
}
