export {drawTable as default};

/*
 * Draw a ranked table of the given features
 *
 * @param {FeatureCollection} data collection of geographic areas with properties
 * @param {String} id property by which to key rows of table
 * @param {String} property other property to display in table
 */
// TODO(juliexxia); take in a list of properties not just one
function drawTable(features, id, property) {
	//TODO(#5): make this settable via ui widget
	const MAX_ENTRIES = 25

	const sortedAndLimited = features.limit(MAX_ENTRIES, property, false /* descending order */);

	const headings = [[id, property]];
	const list = ee.List(sortedAndLimited.iterate(
		function(feature, list) {
			return ee.List(list).add([feature.get(id), feature.get(property)]);
		},
		headings));
	list.evaluate(function(success, failure) {
		if (typeof failure !== 'undefined') {
			console.log(failure);
		} else {
			const data = google.visualization.arrayToDataTable(success, false);
			// Instantiate and draw the chart.
			const chart = new google.visualization.Table(document.getElementById('chart_div'));
			chart.draw(data, null /* styleOptions */);
		}
	});
}
