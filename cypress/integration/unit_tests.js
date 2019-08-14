import processJoinedData from '../../client-side/static/process_joined_data.js';

describe('Unit test', () => {
  it('Process joined data functions', () => {
    const featureProperties = new Map();
    featureProperties.set('SNAP', 2);
    featureProperties.set('TOTAL', 4);
    featureProperties.set('BUILDING_COUNT', ee.Number(75));
    featureProperties.set('GEOID', 'geoid');
    featureProperties.set('AFF', 1);
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
    const result = processJoinedData(
        joinedData, ee.Number(100) /* scalingFactor */,
        0.3 /* povertyThreshold */);
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
        .to.equal(Math.round(100 * (1 * 1 + 10 * 1 + 2 * 2 + 1 * 3) / 75));
    expect(resultProperties.get('style')).to.eql({color: 'ff00ff24'});
  });
});
