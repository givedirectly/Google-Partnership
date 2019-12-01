import {colorMap, createStyleFunction} from '../../../docs/firebase_layers.js';

describe('Unit test for generating style functions', () => {
  it('calculates a discrete function', () => {
    const fxn = createStyleFunction({
      'current-style': 1,
      'field': 'flavor',
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
      'current-style': 0,
      'field': 'oranges',
      'color': 'orange',
      'columns': {'oranges': {'min': 14, 'max': 10005}},
    });
    const orangeish = fxn({'properties': {'oranges': 734}});
    // orange = [255, 140, 0]
    // white = [255, 255, 255]
    expect(orangeish[0]).to.eq(255 + (255 - 255) * ((734 - 14) / (10005 - 14)));
    expect(orangeish[1]).to.eq(255 + (140 - 255) * ((734 - 14) / (10005 - 14)));
    expect(orangeish[2]).to.eq(255 + (0 - 255) * ((734 - 14) / (10005 - 14)));
    expect(orangeish[3]).to.eq(500);
  });

  it('calculates a single-color function', () => {
    const fxn = createStyleFunction({
      'current-style': 2,
      'color': 'blue',
    });
    const trueBlue = fxn({});
    const blue = colorMap.get('blue');
    expect(trueBlue).to.eql(blue);
  });
});
