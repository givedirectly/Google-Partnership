import {cyQueue} from '../../support/commands.js';

describe(
    'Tests of Cypress ordering: self-documentation, detecting behavior changes',
    () => {
      it('Tests that assumptions of ordering are correct', () => {
        const threadOrdering = [];
        let resolveFunction = null;
        new Promise((resolve) => resolveFunction = resolve)
            .then(() => threadOrdering.push('promise'));
        cy.document().then((doc) => {
          const div = doc.createElement('div');
          div.id = 'myid';
          doc.body.appendChild(div);
        });
        cyQueue(resolveFunction).then(() => threadOrdering.push('resolved'));
        cy.get('#myid').then(() => threadOrdering.push('get'));
        cy.wait(0)
            .then(() => threadOrdering.push('wait'))
            .then(() => expect(threadOrdering).to.eql([
              'resolved',
              'get',
              'promise',
              'wait',
            ]));
      });

      it('Tests that promise can finish first if dom element not found', () => {
        const threadOrdering = [];
        let resolveFunction;
        let doc;
        new Promise((resolve) => resolveFunction = resolve).then(() => {
          threadOrdering.push('promise');
          const div = doc.createElement('div');
          div.id = 'new-id';
          doc.body.appendChild(div);
        });
        cy.document().then((returnedDoc) => {
          doc = returnedDoc;
          const div = returnedDoc.createElement('div');
          div.id = 'myid';
          returnedDoc.body.appendChild(div);
        });
        cyQueue(resolveFunction).then(() => threadOrdering.push('resolved'));
        cy.get('#new-id')
            .then(() => threadOrdering.push('get'))
            .then(() => expect(threadOrdering).to.eql([
              'resolved',
              'promise',
              'get',
            ]));
      });
    });
