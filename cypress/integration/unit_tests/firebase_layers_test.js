import {getLinearGradient} from '../../../docs/firebase_layers.js';

it('creates the correct linear gradients', () => {
  const layer1 = {
    'colorFunction': {
      'currentStyle': 0,
      'color': 'yellow',
    },
  };

  const layer2 = {
    'colorFunction': {
      'currentStyle': 1,
      'colors': ['yellow', 'red'],
    },
  };

  const layer3 = {
    'colorFunction': {
      'currentStyle': 2,
      'color': 'blue',
    },
  };
  const layer1Gradient = 'linear-gradient(to right, white, yellow)';
  expect(getLinearGradient(layer1.colorFunction)).to.equal(layer1Gradient);

  const layer2Gradient =
      'linear-gradient(to right, yellow 0%, yellow 50%, red 50%, red 100%)';
  expect(getLinearGradient(layer2.colorFunction)).to.equal(layer2Gradient);

  const layer3Gradient = 'linear-gradient(to right, blue, blue)';
  expect(getLinearGradient(layer3.colorFunction)).to.equal(layer3Gradient);
});
