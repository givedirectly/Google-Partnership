export {setUpPolygonDrawing as default};

const drawingOptions = {
            fillColor: '#ff0000',
            strokeColor: '#ff0000'
          };

// Create a Google Maps Drawing Manager for drawing polygons.
function setUpPolygonDrawing(map) {
  const drawingManager = new google.maps.drawing.DrawingManager({
      drawingControl: true,
      circleOptions: drawingOptions,
      polygonOptions: drawingOptions,
      polylineOptions: drawingOptions,
      rectangleOptions: drawingOptions});

  // TODO(janakr): persist drawn polygon to backend when we're ready.
  // google.maps.event.addListener(drawingManager, 'overlaycomplete',
  //     function(event) {
  //       setPolygon(event.overlay);
  //     });

  drawingManager.setMap(map);
  console.log(drawingManager);
}

