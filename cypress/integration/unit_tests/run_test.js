import * as Error from '../../../docs/error.js';
import * as Resources from '../../../docs/resources.js';
import {setScorePromises} from '../../../docs/run.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

const waitForPromiseToResolve = 6000;

describe('Unit test for run.js', () => {
  loadScriptsBeforeForUnitTests('ee');
  let errorStub;
  beforeEach(() => errorStub = cy.stub(Error, 'showError'));

  it('Score asset present', () => {
    const assetName = 'TIGER/2018/States';
    cy.stub(Resources, 'getScoreAssetPath').returns(assetName);
    const backupStub = cy.stub(Resources, 'getBackupScoreAssetPath');
    // TODO(https://github.com/cypress-io/cypress/issues/5980): Remove
    cy.wait(waitForPromiseToResolve);
    cy.wrap(setScorePromises()).then((result) => {
      expect(result).to.equal(assetName);
      expect(backupStub).to.not.be.called;
      expect(errorStub).to.not.be.called;
    });
  });

  it('Score asset not present, but backup is', () => {
    cy.stub(Resources, 'getScoreAssetPath')
        .returns('nonexistent/feature/collection');
    const backupName = 'TIGER/2018/States';
    cy.stub(Resources, 'getBackupScoreAssetPath').returns(backupName);
    // TODO(https://github.com/cypress-io/cypress/issues/5980): Remove
    cy.wait(waitForPromiseToResolve);
    cy.wrap(setScorePromises()).then((result) => {
      expect(result).to.equal(backupName);
      expect(errorStub).to.be.calledOnce;
    });
  });


  it('Neither asset present', () => {
    cy.stub(Resources, 'getScoreAssetPath')
        .returns('nonexistent/feature/collection');
    cy.stub(Resources, 'getBackupScoreAssetPath').returns('another/bad/asset');
    const promise = setScorePromises().then(
        (result) => assert.fail(null, null, 'unexpected: ' + result), (err) => {
          expect(err).to.contain('another/bad/asset');
          expect(err).to.contain('not found.');
        });
    // TODO(https://github.com/cypress-io/cypress/issues/5980): Remove
    cy.wait(waitForPromiseToResolve);
    cy.wrap(promise).then(() => expect(errorStub).to.be.calledOnce);
  });
});
