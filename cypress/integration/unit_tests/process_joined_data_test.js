import processJoinedData from '../../../client-side/static/process_joined_data.js';

const featureProperties = {
  'SNAP HOUSEHOLDS': 2,
  'TOTAL HOUSEHOLDS': 4,
  'BUILDING COUNT': 27,
  'BLOCK GROUP': 'block group',
  'no-damage': 12,
  'minor-damage': 10,
  'major-damage': 5};
const feature = {};
feature.properties = featureProperties;
const geometryObject = {};
feature.geometry = geometryObject;
const joinedDataPromise = {};
joinedDataPromise.then = (lambda) => lambda({features: [feature]});

describe('Unit test for processed_joined_data.js', () => {
  it('Processes an above threshold block group', () => {
    const result = processJoinedData(
        joinedDataPromise, ee.Number(100) /* scalingFactor */,
        0.3 /* povertyThreshold */, 0.5 /* damageThreshold */,
        0.5 /* povertyWeight */);
    expect(result).to.be.an('array');
    expect(result.length).to.equal(1);
    const returnedFeature = result[0];
    expect(returnedFeature).to.have.property('geometry', geometryObject);
    expect(returnedFeature).to.haveOwnProperty('properties');
    const resultProperties = returnedFeature.properties;
    // We modify the properties in place.
    expect(resultProperties).to.equal(featureProperties);
    expect(resultProperties).to.have.property('BLOCK GROUP', 'block group');
    expect(resultProperties).to.have.property('SCORE',
        Math.round(100 * (0.5 * ((10 + 5) / 27) + 0.5 * (2 / 4))));
    expect(resultProperties).to.have.property('color', [255, 0, 255, 83]);
  });

  xit('Processes uneven weights', () => {
    const result = processJoinedData(
        joinedDataPromise, ee.Number(100) /* scalingFactor */,
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

  xit('Processes a below threshold block group', () => {
    const result = processJoinedData(
        joinedDataPromise, ee.Number(100) /* scalingFactor */,
        0.9 /* povertyThreshold */, 0.5 /* damageThreshold */,
        0.5 /* povertyWeight */);
    const resultProperties = result[0].properties;
    const score = resultProperties.get('SCORE');
    expect(score._myNumberValue).to.equals(0);
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff00'});
  });
});
