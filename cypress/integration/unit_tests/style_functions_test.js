import {colorMap, createStyleFunction} from '../../../docs/firebase_layers.js';

describe('Unit test for generating style functions', () => {
  it('calculates a discrete function', () => {
    const fxn = createStyleFunction({
      'style': 1,
      'field': 'flavor',
      'opacity': 100,
      'colors': {
        'cherry': 'red',
        'banana': 'yellow',
      },
    });
    const cherry = fxn({'properties': {'flavor': 'cherry'}});
    const expectedCherry = colorMap.get('red');
    expect(cherry).to.eql(expectedCherry);
    const banana = fxn({'properties': {'flavor': 'banana'}});
    const expectedBanana = colorMap.get('yellow');
    expect(banana).to.eql(expectedBanana);
  });

  it('calculates a continuous function', () => {
    const fxn = createStyleFunction({
      'style': 0,
      'field': 'oranges',
      'base-color': 'orange',
      'opacity': 83,
      'min': 14,
      'max': 10005,
    });
    const orangeish = fxn({'properties': {'oranges': 734}});
    // orange = [255, 140, 0]
    // white = [255, 255, 255]
    expect(orangeish[0]).to.eq((255 * (734 - 14) + 255 * (10005 - 734)) / 2);
    expect(orangeish[1]).to.eq((140 * (734 - 14) + 255 * (10005 - 734)) / 2);
    expect(orangeish[2]).to.eq((0 * (734 - 14) + 255 * (10005 - 734)) / 2);
    expect(orangeish[3]).to.eq(83);
  });

  it('calculates a single-color function', () => {
    const fxn = createStyleFunction({
      'style': 2,
      'single-color': 'blue',
      'opacity': 83,
    });
    const trueBlue = fxn({});
    const blue = colorMap.get('blue');
    expect(trueBlue).to.eql(blue);
  });
});
