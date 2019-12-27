import {processJoinedData} from '../../../docs/process_joined_data.js';

const featureProperties = {
  'SNAP HOUSEHOLDS': 2,
  'TOTAL HOUSEHOLDS': 4,
  'SNAP PERCENTAGE': 0.5,
  'BUILDING COUNT': 27,
  'BLOCK GROUP': 'block group',
  'no-damage': 12,
  'minor-damage': 10,
  'major-damage': 5,
  'DAMAGE PERCENTAGE': 15 / 27,
};
const feature = {};
feature.properties = featureProperties;
const geometryObject = {};
feature.geometry = geometryObject;
const joinedDataPromise = {};
joinedDataPromise.then = (lambda) => lambda([feature]);

describe('Unit test for processed_joined_data.js', () => {
  it('Processes an above threshold block group', () => {
    processJoinedData(
        joinedDataPromise, 100 /* scalingFactor */,
        Promise.resolve(
            {povertyThreshold: 0.3, damageThreshold: 0.5, povertyWeight: 0.5}))
        .then((result) => {
          expect(result).to.be.an('array');
          expect(result.length).to.equal(1);
          const returnedFeature = result[0];
          expect(returnedFeature).to.have.property('geometry', geometryObject);
          expect(returnedFeature).to.haveOwnProperty('properties');
          const resultProperties = returnedFeature.properties;
          // We modify the properties in place.
          expect(resultProperties).to.equal(featureProperties);
          expect(resultProperties)
              .to.have.property('BLOCK GROUP', 'block group');
          expect(resultProperties)
              .to.have.property(
                  'SCORE',
                  Math.round(100 * (0.5 * ((10 + 5) / 27) + 0.5 * (2 / 4))));
          assertColorAndOpacity(resultProperties, 135);
        });
  });

  it('Processes uneven weights', () => {
    processJoinedData(
        joinedDataPromise, 100 /* scalingFactor */,
        Promise.resolve(
            {povertyThreshold: 0.3, damageThreshold: 0.5, povertyWeight: 0.9}))
        .then((result) => {
          expect(result).to.be.an('array');
          expect(result.length).to.equal(1);
          const returnedFeature = result[0];
          expect(returnedFeature).to.have.property('geometry', geometryObject);
          expect(returnedFeature).to.haveOwnProperty('properties');
          const resultProperties = returnedFeature.properties;
          expect(resultProperties)
              .to.have.property('BLOCK GROUP', 'block group');
          expect(resultProperties)
              .to.have.property(
                  'SCORE',
                  Math.round(100 * (0.1 * ((10 + 5) / 27) + 0.9 * (2 / 4))));
          assertColorAndOpacity(resultProperties, 130);
        });
  });

  it('Processes a below threshold block group', () => {
    processJoinedData(
        joinedDataPromise, 100 /* scalingFactor */,
        Promise.resolve(
            {povertyThreshold: 0.9, damageThreshold: 0.5, povertyWeight: 0.5}))
        .then((result) => {
          const resultProperties = result[0].properties;
          expect(resultProperties).to.have.property('SCORE', 0);
          assertColorAndOpacity(resultProperties, 0);
        });
  });

  /**
   * Asserts that resultProperties has a color attribute with expected opacity.
   *
   * @param {Object} resultProperties
   * @param {number} opacity
   */
  function assertColorAndOpacity(resultProperties, opacity) {
    expect(resultProperties).to.have.property('color');
    expect(resultProperties['color']).to.eqls([255, 0, 255, opacity]);
  }
});
