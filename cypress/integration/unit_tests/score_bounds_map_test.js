import {addPolygonWithPath, defaultMapCenter, defaultZoomLevel} from '../../../docs/basic_map.js';
import {ScoreBoundsMap} from '../../../docs/import/score_bounds_map.js';
import {getConvertEeObjectToPromiseRelease} from '../../support/import_test_util.js';
import {loadScriptsBeforeForUnitTests} from '../../support/script_loader';

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

const newSw = {
  lng: -50,
  lat: 20,
};
const newNe = {
  lng: -40,
  lat: 30,
};

describe('Unit tests for ScoreBoundsMap class', () => {
  loadScriptsBeforeForUnitTests('ee', 'jquery', 'maps');

  let underTest;
  const storedSaves = [];
  before(() => {
    cy.visit('test_utils/empty.html');
    cy.document().then((doc) => {
      const div = $(doc.createElement('div'));
      div.css('width', '100%');
      div.css('height', '80%');
      div.prop('id', 'score-bounds-map');
      doc.body.appendChild(div[0]);

      // Create and show map. Done in before block because can only be done once
      // safely per test, since Google Maps Javascript object is very finicky.
      underTest = new ScoreBoundsMap(
          div[0],
          (data) =>
              storedSaves.push(data ? data.map((ll) => ll.toJSON()) : data));
    });
    beforeEach(() => storedSaves.length = 0);
  });

  it('tests ScoreBoundsMap class', () => {
    const deleteConfirmStub = cy.stub(window, 'confirm').returns(true);
    underTest.initialize(scoreBoundsCoordinates, ['TX', 'LA']);
    expect(underTest.polygon).to.not.be.null;
    expect(underTest.polygon.getMap()).to.eql(underTest.map);
    expect(underTest.drawingManager.getMap()).to.be.null;
    expect(storedSaves).to.be.empty;
    cy.get('[title="Draw a shape"').should('not.exist');
    cy.get('.score-bounds-delete-button').should('be.visible').then(() => {
          // Bounds have not yet been set.
          expect(underTest.map.getBounds().contains(scoreBoundsCoordinates[1]))
              .to.be.false;
          // Now they're set.
          underTest.onShow();
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
          // Modify polygon, check that new path was saved.
          underTest.polygon.getPath().setAt(
              0, new google.maps.LatLng({lng: -100, lat: 30}));
          expect(storedSaves).to.eql([[
            {lng: -100, lat: 30},
            ...scoreBoundsCoordinates.slice(1),
          ]]);
          storedSaves.length = 0;
          // Switch to "new" disaster that has no polygon.
          underTest.initialize(null, ['TX', 'LA']);
          expect(underTest.polygon).to.be.null;
          expect(underTest.drawingManager.getMap()).to.eql(underTest.map);
          expect(storedSaves).to.be.empty;
          return underTest.onShow();
        })
        .then(() => {
          // Bounds were reset.
          expect(underTest.map.getBounds().contains(newSw)).to.be.false;
          expect(underTest.map.getBounds().contains(newNe)).to.be.false;
          // We have a reasonably tight map around Texas and Louisiana
          expect(underTest.map.getBounds().contains({lng: -100, lat: 32}))
              .to.be.true;
          expect(underTest.map.getBounds().contains({lng: -91, lat: 32}))
              .to.be.true;
          expect(underTest.map.getBounds().contains({lng: -100, lat: 41}))
              .to.be.false;
        });

    // No polygon, so no delete, and drawing manager visible.
    cy.get('.score-bounds-delete-button').should('not.be.visible');
    cy.get('[title="Draw a shape"]').then(() => {
      // Simulate drawing a polygon.
      addPolygonWithPath(
          underTest._createPolygonOptions(newPolygonCoordinates),
          underTest.drawingManager);
      // Polygon appears as expected, and data was saved.
      expect(underTest.polygon).to.not.be.null;
      expect(underTest.polygon.getMap()).to.eql(underTest.map);
      expect(underTest.drawingManager.getMap()).to.be.null;
      expect(storedSaves).to.eql([newPolygonCoordinates]);
      storedSaves.length = 0;
    });
    cy.get('[title="Draw a shape"]').should('not.exist');
    // Delete the polygon and verify it's gone everywhere.
    cy.get('.score-bounds-delete-button').click().then(() => {
      expect(deleteConfirmStub).to.be.calledOnce;
      expect(underTest.polygon).to.be.null;
      expect(underTest.drawingManager.getMap()).to.eql(underTest.map);
      expect(storedSaves).to.eql([null]);
    });
  });

  it('tests ScoreBoundsMap does not zoom to states if user zooms first', () => {
    underTest.map.setCenter(defaultMapCenter);
    underTest.map.setZoom(defaultZoomLevel);
    const releasePromise = getConvertEeObjectToPromiseRelease();
    underTest.initialize(null, ['TX', 'LA']);
    const promise = underTest.onShow();
    expect(promise).to.not.be.null;
    cy.wait(50).then(
        () => expect(underTest.map.getBounds().contains({lng: -100, lat: 41}))
                  .to.be.true);
    let zoomedBounds;
    cy.get('[title="Zoom in"]').click().then(() => {
      zoomedBounds = underTest.map.getBounds();
      expect(zoomedBounds.contains({lng: -100, lat: 41})).to.be.false;
      releasePromise();
    });
    cy.wrap(promise).then(() => expect(map.getBounds()).to.eql(zoomedBounds));
  });

  it('Tests callbacks for ScoreBoundsMap after drag', () => {
    underTest.initialize(scoreBoundsCoordinates, ['TX', 'LA']);
    underTest.onShow();
    google.maps.event.trigger(underTest.polygon, 'dragstart');
    google.maps.event.trigger(underTest.polygon, 'dragend');
    expect(storedSaves).to.eql([scoreBoundsCoordinates]);
    storedSaves.length = 0;
    // Modify polygon, check that new path was saved.
    underTest.polygon.getPath().setAt(
        0, new google.maps.LatLng({lng: -100, lat: 30}));
    expect(storedSaves).to.eql([[
      {lng: -100, lat: 30},
      ...scoreBoundsCoordinates.slice(1),
    ]]);
  });
});
