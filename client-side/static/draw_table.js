export {drawTable as default};

// @param data FeatureCollection of geographic areas
// @param id property by which to key rows of table
// @param property other property to display in table
// TODO(juliexxia); take in a list of properties not just one
function drawTable(features, id, property) {
	//TODO: make this settable via ui widget
	const MAX_ENTRIES = 25

	const sortedAndLimited = features.limit(MAX_ENTRIES, property, false);

	const headings = [[id, property]];
	const list = ee.List(sortedAndLimited.iterate(
		function(feature, list) {
			return ee.List(list).add([feature.get(id), feature.get(property)]);
		},
		headings));
	const data = google.visualization.arrayToDataTable(list.getInfo(), false);

	// Instantiate and draw the chart.
	const chart = new google.visualization.Table(document.getElementById('chart_div'));
	// No style options yet.
	chart.draw(data, null);
}
