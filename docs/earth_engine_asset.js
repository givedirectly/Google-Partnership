export {terrainStyle};

/**
 * Style function for earth engine elevation data.
 * @param {ee.Element} layer
 * @return {number}
 */
function terrainStyle(layer) {
  const aspect = ee.Terrain.aspect(layer);
  return aspect.divide(180).multiply(Math.PI).sin();
}
