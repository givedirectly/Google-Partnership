import processJoinedData from '../../../client-side/static/process_joined_data.js';

const featureProperties = new Map();
featureProperties.set('SNAP', 2);
featureProperties.set('TOTAL', 4);
featureProperties.set('BUILDING_COUNT', 45);
featureProperties.set('GEOID', 'geoid');
featureProperties.set('NOD', 0);
featureProperties.set('UNK', 0);
featureProperties.set('AFF', 12);
featureProperties.set('MIN', 10);
featureProperties.set('MAJ', 2);
featureProperties.set('DES', 1);
const feature = {};
feature.get = (prop) => featureProperties.get(prop);
const geometryObject = {};
feature.geometry = () => geometryObject;
const joinedData = {};
joinedData.map = (lambda) => {
  return [lambda(feature)];
};

describe('Unit test for processed_joined_data.js', () => {
  it('Processes an above threshold block group', () => {
    const result = processJoinedData(
        joinedData, ee.Number(100) /* scalingFactor */,
        0.3 /* povertyThreshold */, 0.5 /* damageThreshold */,
        0.5 /* povertyWeight */, 0.5 /* damageWeight */);
    expect(result).to.be.an('array');
    expect(result.length).to.equal(1);
    const returnedFeature = result[0];
    expect(returnedFeature).to.have.property('geometry', geometryObject);
    expect(returnedFeature).to.haveOwnProperty('properties');
    const resultProperties = returnedFeature.properties;
    expect(resultProperties.get('GEOID')).to.equal('geoid');
    const priority = resultProperties.get('PRIORITY');
    expect(priority).to.haveOwnProperty('_myNumberValue');
    expect(priority._myNumberValue)
        .to.equals(
            Math.round(100 * (0.5 * ((12 + 10 + 2 + 1) / 45) + 0.5 * (2 / 4))));
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff53'});
  });

  it('Processes a below threshold block group', () => {
    const result = processJoinedData(
        joinedData, ee.Number(100) /* scalingFactor */,
        0.9 /* povertyThreshold */, 0.5 /* damageThreshold */,
        0.5 /* povertyWeight */, 0.5 /* damageWeight */);
    const resultProperties = result[0].properties;
    const priority = resultProperties.get('PRIORITY');
    expect(priority._myNumberValue).to.equals(0);
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff00'});
  });
});
