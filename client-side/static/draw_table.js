import {geoidTag, priorityTag, snapTag} from './script.js';

export {drawDashboard as default };

function drawTable(features, povertyThreshold) {
    const sortedAboveThreshold = features.filter(ee.Filter.gte(snapTag, povertyThreshold)).sort(priorityTag, false);
    const headings = [geoidTag, priorityTag, snapTag]
    const asListWithHeadings = ee.List(sortedAboveThreshold.iterate(
        function(feature, list) {
        	// Keep key order same as @const headings
            return ee.List(list)
            	.add([feature.get(geoidTag), feature.get(priorityTag), feature.get(snapTag)]);
        },
        [headings]));
    asListWithHeadings.evaluate(function(success, failure) {
        if (typeof failure !== 'undefined') {
            // TODO(juliexxia): more robust error reporting
            // https://developers.google.com/chart/interactive/docs/reference#errordisplay
            console.log(failure);
        } else {
            const data = google.visualization.arrayToDataTable(success, false);
            // Instantiate and draw the chart.
            if (typeof data !== 'undefined') {
            	console.log("drawing! me!");
        	    const table = new google.visualization.ChartWrapper({
        			'chartType': 'Table',
        			'containerId': 'table',
        			'dataTable': data,
        			'options': {
        				'page': 'enable',
        				'pageSize': 25,
        			}
    			});
                table.draw();
            }
        }
    });
}