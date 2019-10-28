describe('Unit test for Popup', () => {
  before(() => {
    // const script = document.createElement('script');
    // script.src = 'https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM';
    // const headElt = document.getElementsByTagName('head');
    // headElt[0].appendChild(script);
  });
  // Reset firebaseCollection's dummy methods.
  beforeEach(() => {
  });

  it('Add shape', () => {
    cy.log(new google.maps.Polygon().getMap());
  });
  it('Another shape', () => {
    cy.log(new google.maps.Polygon().getMap());
  });
});
