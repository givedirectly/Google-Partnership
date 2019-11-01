import {firebaseAssets} from '../../../docs/firebase_assets';
import {colorMap, getStyleFunction, initializeFirebaseAssets} from '../../../docs/firebase_assets.js';

describe('Unit test for generating style functions', () => {
  before(() => initializeFirebaseAssets({}));

  after(
      () => Object.keys(firebaseAssets)
                .forEach((asset) => firebaseAssets[asset] = undefined));

  it('calculates a discrete function', () => {
    firebaseAssets['asset0'] = {
      'color-fxn': {
        'continuous': false,
        'field': 'flavor',
        'opacity': 100,
        'colors': {
          'cherry': 'red',
          'banana': 'yellow',
        },
      },
    };

    const fxn = getStyleFunction('asset0');
    const cherry = fxn({'properties': {'flavor': 'cherry'}});
    const expectedCherry = colorMap.get('red');
    for (let i = 0; i < 4; i++) {
      expect(cherry[i]).to.eq(expectedCherry[i]);
    }
    const banana = fxn({'properties': {'flavor': 'banana'}});
    const expectedBanana = colorMap.get('yellow');
    for (let i = 0; i < 4; i++) {
      expect(banana[i]).to.eq(expectedBanana[i]);
    }
  });

  it('calculates a continuous function', () => {
    firebaseAssets['asset1'] = {
      'color-fxn': {
        'continuous': true,
        'field': 'oranges',
        'base-color': 'orange',
        'opacity': 83,
        'min': 14,
        'max': 10005,
      },
    };

    const fxn = getStyleFunction('asset1');
    const orangeish = fxn({'properties': {'oranges': 734}});
    // orange = [255, 140, 0]
    // white = [255, 255, 255]
    expect(orangeish[0]).to.eq((255 * (734 - 14) + 255 * (10005 - 734)) / 2);
    expect(orangeish[1]).to.eq((140 * (734 - 14) + 255 * (10005 - 734)) / 2);
    expect(orangeish[2]).to.eq((0 * (734 - 14) + 255 * (10005 - 734)) / 2);
    expect(orangeish[3]).to.eq(83);
  });

  it('calculates a single-color function', () => {
    firebaseAssets['asset2'] = {
      'color-fxn': {
        'single-color': 'blue',
        'opacity': 83,
      },
    };

    const fxn = getStyleFunction('asset2');
    const trueBlue = fxn({});
    const blue = colorMap.get('blue');
    for (let i = 0; i < 4; i++) {
      expect(trueBlue[i]).to.eq(blue[i]);
    }
  });
});