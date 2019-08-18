import highlightFeatures from '../../../client-side/static/highlight_features.js';

describe('Unit test for highlight_features.js', () => {
  it('Show feature, then hide', () => {
    const dataApi = {
      addGeoJson: (feature) => [feature],
      remove: (feature) => {},
      overrideStyle: (feature, style) => {},
    };
    const map = {};
    map.data = dataApi;
    let mockData = Cypress.sinon.mock(dataApi);
    mockData.expects('addGeoJson').never();
    mockData.expects('remove').never();
    // Empty call succeeds.
    highlightFeatures([], map);
    mockData.verify();

    // Simple add succeeds.
    const geometry0 = {id: 0};
    const jsonFeature0 = {'type': 'Feature', 'geometry': geometry0};
    mockData = Cypress.sinon.mock(dataApi);
    mockData.expects('addGeoJson').once().withArgs(jsonFeature0).returns([
      jsonFeature0,
    ]);
    mockData.expects('remove').never();
    const style = {
      fillColor: 'red',
      strokeColor: 'red',
    };
    mockData.expects('overrideStyle').once().withArgs(jsonFeature0, style);
    highlightFeatures([makeFeature(0, geometry0)], map);
    mockData.verify();

    // Add multiple on top succeeds, and removes old one.
    const geometry1 = {id: 1};
    const geometry2 = {id: 2};
    const jsonFeature1 = {'type': 'Feature', 'geometry': geometry1};
    const jsonFeature2 = {'type': 'Feature', 'geometry': geometry2};
    mockData = Cypress.sinon.mock(dataApi);
    mockData.expects('addGeoJson').once().withArgs(jsonFeature1).returns([
      jsonFeature1,
    ]);
    mockData.expects('addGeoJson').once().withArgs(jsonFeature2).returns([
      jsonFeature2,
    ]);
    mockData.expects('remove').once().withArgs(jsonFeature0);
    mockData.expects('overrideStyle').once().withArgs(jsonFeature1, style);
    mockData.expects('overrideStyle').once().withArgs(jsonFeature2, style);
    highlightFeatures(
        [makeFeature(1, geometry1), makeFeature(2, geometry2)], map);
    mockData.verify();

    // Just keep feature2, feature1 is removed.
    mockData = Cypress.sinon.mock(dataApi);
    mockData.expects('addGeoJson').never();
    mockData.expects('remove').once().withArgs(jsonFeature1);
    mockData.expects('overrideStyle').never();
    highlightFeatures([makeFeature(2, geometry2)], map);
    mockData.verify();
  });
});

/**
 * Utility function to make a fake feature.
 *
 * @param {number} geoid fake geoid
 * @param {Object} geometry fake geometry
 * @return {Object}
 */
function makeFeature(geoid, geometry) {
  return {properties: {'GEOID': geoid}, geometry: geometry};
}
