export {highlightFeature as default};

function highlightFeature(feature, map) {
  const firstGeometry = feature.geometry();
  firstGeometry.evaluate(function(geo, failure) {
    if (geo) {
      const jsonGeometry = JSON.parse(ee.Geometry(geo).toGeoJSONString());
      const feature = {'type': 'Feature', 'geometry': jsonGeometry};
      map.data.addGeoJson(feature).forEach(
          item => map.data.overrideStyle(
              item, {fillColor: 'red', strokeColor: 'red'}));
    } else {
      console.error('Error retrieving geometry: ', failure);
    }
  });
}
