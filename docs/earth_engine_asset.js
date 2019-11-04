export {terrainStyle};

function terrainStyle(layer) {
  const aspect = ee.Terrain.aspect(layer);
  return aspect.divide(180).multiply(Math.PI).sin();
}
