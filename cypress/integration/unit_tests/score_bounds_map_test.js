import {addPolygonWithPath} from '../../../docs/basic_map.js';
import {ScoreBoundsMap} from '../../../docs/import/score_bounds_map.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';
import {convertPathToLatLng} from '../../support/test_map.js';

describe('Unit tests for ScoreBoundsMap class', () => {
  loadScriptsBeforeForUnitTests('jquery', 'maps');

  it('tests ScoreBoundsMap class', () => {
    const deleteConfirmStub = cy.stub(window, 'confirm').returns(true);
    const scoreBoundsCoordinates = [
      {lng: -95, lat: 30},
      {lng: -90, lat: 50},
      {lng: -90, lat: 30},
    ];
    const newPolygonCoordinates = [
      {lng: -110, lat: 40},
      {lng: -90, lat: 50},
      {lng: -90, lat: 40},
    ];
    const newSw = {lng: -50, lat: 20};
    const newNe = {lng: -40, lat: 30};
    let underTest;
    const storedSaves = [];
    cy.visit('test_utils/empty.html');
    cy.document().then((doc) => {
      cy.stub(document, 'getElementById')
          .callsFake((id) => doc.getElementById(id));
      const div = $(doc.createElement('div'));
      div.css('width', '100%');
      div.css('height', '80%');
      div.prop('id', 'score-bounds-map');
      doc.body.appendChild(div[0]);

      // Create and show map, with a polygon.
      underTest = new ScoreBoundsMap(
          (data) => storedSaves.push(data ? convertPathToLatLng(data) : data));
      underTest.initialize(scoreBoundsCoordinates);
      expect(underTest.polygon).to.not.be.null;
      expect(underTest.polygon.getMap()).to.eql(underTest.map);
      expect(underTest.drawingManager.getMap()).to.be.null;
      expect(storedSaves).to.be.empty;
    });
    cy.get('[title="Draw a shape"').should('not.exist');
    cy.get('.score-bounds-delete-button').should('be.visible').then(() => {
      // TODO(janakr): Bounds are not available immediately after map
      //  initialization. Putting it here, after a few cy.get() operations,
      //  appears to be enough, but might have to add a wait if flaky.
      // Check that map bounds have adjusted to include the polygon we drew,
      // which extends north of the US into Canada.
      const bounds = underTest.map.getBounds();
      scoreBoundsCoordinates.forEach(
          (point) => expect(bounds.contains(point)).to.be.true);
      // Now pan the map way over, just for fun.
      expect(underTest.map.getBounds().contains(newSw)).to.be.false;
      expect(underTest.map.getBounds().contains(newNe)).to.be.false;
      underTest.map.fitBounds(new google.maps.LatLngBounds(newSw, newNe));
      expect(underTest.map.getBounds().contains(newSw)).to.be.true;
      expect(underTest.map.getBounds().contains(newNe)).to.be.true;
      // Modify polygon.
      underTest.polygon.getPath().setAt(
          0, new google.maps.LatLng({lng: -100, lat: 30}));
      expect(storedSaves).to.eql([[
        {lng: -100, lat: 30},
        ...scoreBoundsCoordinates.slice(1),
      ]]);
      storedSaves.length = 0;
      // Switch to "new" disaster that has no polygon.
      underTest.initialize(null);
      expect(underTest.polygon).to.be.null;
      expect(underTest.drawingManager.getMap()).to.eql(underTest.map);
      expect(storedSaves).to.be.empty;
      expect(underTest.map.getBounds().contains(newSw)).to.be.false;
      expect(underTest.map.getBounds().contains(newNe)).to.be.false;
    });

    // No polygon, so no delete, and drawing manager visible.
    cy.get('.score-bounds-delete-button').should('not.be.visible');
    cy.get('[title="Draw a shape"]').then(() => {
      // Simulate drawing a polygon.
      addPolygonWithPath(
          underTest._createPolygonOptions(newPolygonCoordinates),
          underTest.drawingManager);
      expect(underTest.polygon).to.not.be.null;
      expect(underTest.polygon.getMap()).to.eql(underTest.map);
      expect(underTest.drawingManager.getMap()).to.be.null;
      expect(storedSaves).to.eql([newPolygonCoordinates]);
      storedSaves.length = 0;
    });
    // Now we have a delete button.
    cy.get('.score-bounds-delete-button').should('be.visible');
    cy.get('[title="Draw a shape"]').should('not.exist');
    // Delete the polygon and verify it's gone everywhere.
    cy.get('.score-bounds-delete-button').click().then(() => {
      expect(deleteConfirmStub).to.be.calledOnce;
      expect(underTest.polygon).to.be.null;
      expect(underTest.drawingManager.getMap()).to.eql(underTest.map);
      expect(storedSaves).to.eql([null]);
    });
  });
});
