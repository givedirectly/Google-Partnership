import processJoinedData from '../../../client-side/static/process_joined_data.js';

const featureProperties = new Map();
featureProperties.set('SNAP HOUSEHOLDS', 2);
featureProperties.set('TOTAL HOUSEHOLDS', 4);
featureProperties.set('BUILDING COUNT', 27);
featureProperties.set('BLOCK GROUP', 'block group');
featureProperties.set('no-damage', 12);
featureProperties.set('minor-damage', 10);
featureProperties.set('major-damage', 5);
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
        0.5 /* povertyWeight */);
    expect(result).to.be.an('array');
    expect(result.length).to.equal(1);
    const returnedFeature = result[0];
    expect(returnedFeature).to.have.property('geometry', geometryObject);
    expect(returnedFeature).to.haveOwnProperty('properties');
    const resultProperties = returnedFeature.properties;
    expect(resultProperties.get('BLOCK GROUP')).to.equal('block group');
    const score = resultProperties.get('SCORE');
    expect(score).to.haveOwnProperty('_myNumberValue');
    expect(score._myNumberValue)
        .to.equals(Math.round(100 * (0.5 * ((10 + 5) / 27) + 0.5 * (2 / 4))));
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff53'});
  });

  it('Processes uneven weights', () => {
    const result = processJoinedData(
        joinedData, ee.Number(100) /* scalingFactor */,
        0.3 /* povertyThreshold */, 0.5 /* damageThreshold */,
        0.9 /* povertyWeight */);
    expect(result).to.be.an('array');
    expect(result.length).to.equal(1);
    const returnedFeature = result[0];
    expect(returnedFeature).to.have.property('geometry', geometryObject);
    expect(returnedFeature).to.haveOwnProperty('properties');
    const resultProperties = returnedFeature.properties;
    expect(resultProperties.get('BLOCK GROUP')).to.equal('block group');
    const score = resultProperties.get('SCORE');
    expect(score).to.haveOwnProperty('_myNumberValue');
    expect(score._myNumberValue)
        .to.equals(Math.round(100 * (0.1 * ((10 + 5) / 27) + 0.9 * (2 / 4))));
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff51'});
  });

  it('Processes a below threshold block group', () => {
    const result = processJoinedData(
        joinedData, ee.Number(100) /* scalingFactor */,
        0.9 /* povertyThreshold */, 0.5 /* damageThreshold */,
        0.5 /* povertyWeight */);
    const resultProperties = result[0].properties;
    const score = resultProperties.get('SCORE');
    expect(score._myNumberValue).to.equals(0);
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff00'});
  });
});
