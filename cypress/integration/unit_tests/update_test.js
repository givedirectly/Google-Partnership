import * as LayerUtil from '../../../docs/layer_util.js';
import * as Run from '../../../docs/run.js';
import {createToggles, toggles} from '../../../docs/update';

let lastPassedPovertyThreshold;
let lastPassedDamageThreshold;
let lastPassedPovertyWeight;

describe('Unit test for updates.js', () => {
  // creates the form div and stubs the relevent document methods.
  beforeEach(() => {
    cy.stub(
        Run, 'createAndDisplayJoinedData',
        (map, povertyThreshold, damageThreshold, povertyWeight) => {
          lastPassedPovertyThreshold = povertyThreshold;
          lastPassedDamageThreshold = damageThreshold;
          lastPassedPovertyWeight = povertyWeight;
        });

    cy.stub(LayerUtil, 'removeScoreLayer', (map) => {});

    const formDiv = document.createElement('div');
    formDiv.class = 'form';
    formDiv.id = 'form-div';

    document.body.appendChild(formDiv);
    const map = {};
    createToggles(map);

    lastPassedDamageThreshold = null;
    lastPassedPovertyThreshold = null;
    lastPassedPovertyWeight = null;
  });

  it('updates weight labels', () => {
    const slider = document.getElementById('poverty weight');
    slider.value = 0.01;

    slider.oninput();

    expect(document.getElementById('poverty weight value').innerHTML)
        .to.equals('0.01');
    expect(document.getElementById('damage weight value').innerHTML)
        .to.equals('0.99');
  });

  it('updates toggles', () => {
    document.getElementById('poverty weight').value = 0.01;
    document.getElementById('damage threshold').value = 0.24;

    // Without this, tests don't currently fail, but the code in update.js
    // silently errors out, so it's a hazard.
    document.getElementById('update').click();

    expect(toggles.get('poverty weight')).to.equals(0.01);
    expect(toggles.get('damage threshold')).to.equals(0.24);
    expect(document.getElementById('error').innerHTML).to.equals('');
    expect(lastPassedPovertyWeight).to.equals(0.01);
    expect(lastPassedDamageThreshold).to.equals(0.24);
  });

  it('updates toggles with errors', () => {
    document.getElementById('poverty threshold').value = -0.01;

    document.getElementById('update').click();

    expect(document.getElementById('error').innerHTML)
        .to.equals('ERROR: poverty threshold must be between 0.00 and 1.00');
    expect(lastPassedPovertyThreshold).to.be.null;
  });

  it('resets', () => {
    toggles.set('poverty weight', 0.77);
    toggles.set('damage threshold', 0.77);

    document.getElementById('poverty weight').value = 0.01;
    document.getElementById('damage threshold').value = 0.24;

    document.getElementById('current settings').click();

    expect(document.getElementById('poverty weight value').innerHTML)
        .to.equals('0.77');
    expect(document.getElementById('damage weight value').innerHTML)
        .to.equals('0.23');
    expect(document.getElementById('damage threshold').value).to.equals('0.77');
    expect(document.getElementById('poverty weight').value).to.equals('0.77');
  });
});
