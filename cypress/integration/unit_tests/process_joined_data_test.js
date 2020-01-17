import {processJoinedData} from '../../../docs/process_joined_data.js';

const featureProperties = {
  '___GD_GOOGLE_DELPHI_GEOID': '45',
  'SNAP HOUSEHOLDS': 2,
  'TOTAL HOUSEHOLDS': 4,
  'poverty rate': 0.5,
  'building count key': 27,
  'district descript': 'block group',
  'no-damage': 12,
  'minor-damage': 10,
  'DAMAGE PERCENTAGE': 15 / 27,
  'major-damage': 5,
};
const feature = {};
feature.properties = featureProperties;
const geometryObject = {};
feature.geometry = geometryObject;
const joinedDataPromise = {};
joinedDataPromise.then = (lambda) => lambda([feature]);

const scoreAssetCreationParameters = {
  povertyRateKey: 'poverty rate',
  districtDescriptionKey: 'district descript',
  buildingKey: 'building count key',
  damageAssetPath: 'damage asset',
};
const SCORE_COMPUTATION_PARAMETERS = {
  povertyThreshold: 0.3,
  damageThreshold: 0.5,
  povertyWeight: 0.5,
  scoreAssetCreationParameters,
};

describe('Unit test for processed_joined_data.js', () => {
  it('Processes an above threshold block group', () => {
    cy.wrap(processJoinedData(
                joinedDataPromise, 100 /* scalingFactor */,
                Promise.resolve(SCORE_COMPUTATION_PARAMETERS)))
        .then(({featuresList, columnsFound}) => {
          expect(columnsFound).to.eql([
            '___GD_GOOGLE_DELPHI_GEOID',
            'district descript',
            'SCORE',
            'poverty rate',
            'DAMAGE PERCENTAGE',
            'building count key',
            'SNAP HOUSEHOLDS',
            'TOTAL HOUSEHOLDS',
            'no-damage',
            'minor-damage',
            'major-damage',
          ]);
          expect(featuresList).to.be.an('array');
          expect(featuresList.length).to.equal(1);
          const [returnedFeature] = featuresList;
          expect(returnedFeature).to.have.property('geometry', geometryObject);
          expect(returnedFeature).to.haveOwnProperty('properties');
          const resultProperties = returnedFeature.properties;
          // We modify the properties in place.
          expect(resultProperties).to.equal(featureProperties);
          expect(resultProperties)
              .to.have.property('district descript', 'block group');
          expect(resultProperties)
              .to.have.property(
                  'SCORE',
                  Math.round(100 * (0.5 * ((10 + 5) / 27) + 0.5 * (2 / 4))));
          assertColorAndOpacity(resultProperties, 135);
        });
  });

  it('Processes uneven weights', () => {
    cy.wrap(processJoinedData(
                joinedDataPromise, 100 /* scalingFactor */, Promise.resolve({
                  povertyThreshold: 0.3,
                  damageThreshold: 0.5,
                  povertyWeight: 0.9,
                  scoreAssetCreationParameters,
                })))
        .then(({featuresList}) => {
          expect(featuresList).to.be.an('array');
          expect(featuresList.length).to.equal(1);
          const [returnedFeature] = featuresList;
          expect(returnedFeature).to.have.property('geometry', geometryObject);
          expect(returnedFeature).to.haveOwnProperty('properties');
          const resultProperties = returnedFeature.properties;
          expect(resultProperties)
              .to.have.property('district descript', 'block group');
          expect(resultProperties)
              .to.have.property(
                  'SCORE',
                  Math.round(100 * (0.1 * ((10 + 5) / 27) + 0.9 * (2 / 4))));
          assertColorAndOpacity(resultProperties, 130);
        });
  });

  it('Processes a below threshold block group', () => {
    cy.wrap(processJoinedData(
                joinedDataPromise, 100 /* scalingFactor */, Promise.resolve({
                  povertyThreshold: 0.9,
                  damageThreshold: 0.5,
                  povertyWeight: 0.5,
                  scoreAssetCreationParameters,
                })))
        .then(({featuresList}) => {
          const resultProperties = featuresList[0].properties;
          expect(resultProperties).to.have.property('SCORE', 0);
          assertColorAndOpacity(resultProperties, 0);
        });
  });

  it('Handles no damage', () => {
    const noDamageScoreAssetCreationParameters =
        Object.assign({}, scoreAssetCreationParameters);
    noDamageScoreAssetCreationParameters.damageAssetPath = null;
    cy.wrap(processJoinedData(
                joinedDataPromise, 100 /* scalingFactor */, Promise.resolve({
                  povertyThreshold: 0.4,
                  damageThreshold: 0.0,
                  povertyWeight: 1.0,
                  scoreAssetCreationParameters:
                      noDamageScoreAssetCreationParameters,
                })))
        .then(({featuresList, columnsFound}) => {
          expect(columnsFound).to.eql([
            '___GD_GOOGLE_DELPHI_GEOID',
            'district descript',
            'SCORE',
            'poverty rate',
            'SNAP HOUSEHOLDS',
            'TOTAL HOUSEHOLDS',
            'no-damage',
            'minor-damage',
            'DAMAGE PERCENTAGE',
            'major-damage',
            'building count key',
          ]);
          const [returnedFeature] = featuresList;
          expect(returnedFeature.properties).to.have.property('SCORE', 50);
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
    expect(resultProperties.color).to.eqls([255, 0, 255, opacity]);
  }
});
