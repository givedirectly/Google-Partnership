import * as Resources from '../../../docs/resources.js';
import {setScorePromiseAndReturnAssetName} from '../../../docs/run.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader.js';

describe('Unit test for run.js', () => {
  loadScriptsBeforeForUnitTests('ee');
  it('Score asset present', () => {
    const assetName = 'TIGER/2018/States';
    cy.stub(Resources, 'getScoreAsset').returns(assetName);
    const backupStub = cy.stub(Resources, 'getBackupScoreAsset');
    cy.wrap(setScorePromiseAndReturnAssetName()).then((result) => {
      expect(result).to.equal(assetName);
      expect(backupStub).to.not.be.called;
    });
  });

  it('Score asset not present, but backup is', () => {
    cy.stub(Resources, 'getScoreAsset')
        .returns('nonexistent/feature/collection');
    const backupName = 'TIGER/2018/States';
    cy.stub(Resources, 'getBackupScoreAsset').returns(backupName);
    cy.wrap(setScorePromiseAndReturnAssetName())
        .then((result) => expect(result).to.equal(backupName));
  });


  it('Neither asset present', () => {
    cy.stub(Resources, 'getScoreAsset')
        .returns('nonexistent/feature/collection');
    cy.stub(Resources, 'getBackupScoreAsset').returns('another/bad/asset');
    const promise = setScorePromiseAndReturnAssetName().then(
        (result) => {
          throw new Error('unexpected: ' + result);
        },
        (err) => {
          expect(err).to.contain('another/bad/asset');
          expect(err).to.contain('not found.');
        });
    cy.wrap(promise);
  });
});
