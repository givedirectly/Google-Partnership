import {createToggles, reset, toggles, updateToggles, updateWeights} from '../../../client-side/static/update.js';

/** A class for localling storing all elements added to the document. */
class MockDocument {
  /**
   * constructor
   */
  constructor() {
    this.elements = new Map();
  }

  /**
   * Adds an element and all its children to our local map. Note - if the
   * children have children, we don't add those. We haven't needed this for
   * testing yet, can add a better loop if needed.
   * @param {HTMLElement} element
   */
  add(element) {
    this.elements.set(element.id, element);
    for (const el of Array.from(element.childNodes)) {
      this.elements.set(el.id, el);
    }
    console.log(this.elements);
  }

  /**
   * Gets the relevent element from our local map.
   * @param {string} id
   * @return {HTMLElement}
   */
  getElementById(id) {
    return this.elements.get(id);
  }
}

const mockDocument = new MockDocument();

describe('Unit test for createToggles', () => {
  // creates the form div and stubs the relevent document methods.
  beforeEach(() => {
    cy.stub(document, 'appendChild', (element) => {
      mockDocument.add(element);
    });
    cy.stub(document, 'getElementById', (id) => {
      return mockDocument.getElementById(id);
    });

    const mockList = {
      item: (index) => {
        return formDiv;
      },
    };

    cy.stub(document, 'getElementsByClassName', () => {
      return mockList;
    });

    const formDiv = document.createElement('div');
    formDiv.class = 'form';

    cy.stub(formDiv, 'appendChild', (element) => {
      mockDocument.add(element);
    });

    document.appendChild(formDiv);
    const map = {};
    createToggles(map);
  });


  it('updates weight labels', () => {
    mockDocument.getElementById('poverty weight').value = 0.01;

    updateWeights();

    expect(mockDocument.getElementById('poverty weight label').innerHTML)
        .to.equals('poverty weight: 0.01');
    expect(mockDocument.getElementById('damage weight label').innerHTML)
        .to.equals('damage weight: 0.99');
  });

  it('updates toggles', () => {
    mockDocument.getElementById('poverty weight').value = 0.01;
    mockDocument.getElementById('damage threshold').value = 0.24;

    updateToggles();

    expect(toggles.get('poverty weight')).to.equals(0.01);
    expect(toggles.get('damage threshold')).to.equals(0.24);
  });

  it('updates toggles with errors', () => {
    mockDocument.getElementById('poverty threshold').value = -0.01;

    updateToggles();

    expect(mockDocument.getElementById('error').innerHTML)
        .to.equals('ERROR: poverty threshold must be between 0.00 and 1.00');
  });

  it('resets', () => {
    toggles.set('poverty weight', 0.77);
    toggles.set('damage threshold', 0.77);

    mockDocument.getElementById('poverty weight').value = 0.01;
    mockDocument.getElementById('damage threshold').value = 0.24;

    reset();

    expect(mockDocument.getElementById('poverty weight label').innerHTML)
        .to.equals('poverty weight: 0.77');
    expect(mockDocument.getElementById('damage weight label').innerHTML)
        .to.equals('damage weight: 0.23');
    expect(mockDocument.getElementById('damage threshold').value)
        .to.equals('0.77');
    expect(mockDocument.getElementById('poverty weight').value)
        .to.equals('0.77');
  });
});
