import {geoidTag, priorityTag, snapTag} from './script.js';

export {drawDashboard as default };

// Percentage at which to initially cutoff poverty level.
const headings = [geoidTag, priorityTag, snapTag]
//TODO(#5): make this settable via ui widget
const MAX_ENTRIES = 25	

function drawDashboard(features) {
	console.log("drawing dashboard " + features.size().getInfo());
    const dashboard = new google.visualization.Dashboard(document.getElementById('dashboard'));
    const table = new google.visualization.ChartWrapper({
        'chartType': 'Table',
        'containerId': 'table',
        'options': {
        	'page': 'enable',
        	'pageSize': 25,
        }
    });

    const list = getTableData(features);
    list.evaluate(function(success, failure) {
        if (typeof failure !== 'undefined') {
            // TODO(juliexxia): more robust error reporting
            // https://developers.google.com/chart/interactive/docs/reference#errordisplay
            console.log(failure);
        } else {
            const data = google.visualization.arrayToDataTable(success, false);
            // Instantiate and draw the chart.
            if (typeof data !== 'undefined') {
            	console.log("drawing! me!");
                dashboard.draw(data);
            }
        }
    });
}

/*
 * Returns a sorted (server-side) list of the given features
 *
 * @param {FeatureCollection} data collection of geographic areas with properties
 * @param {String} id property by which to key rows of table
 * @param {String} property other property to display in table
 */
// TODO(juliexxia); take in a list of properties not just one
function getTableData(features) {
    const sorted = features.sort(priorityTag, false);
    const list = ee.List(sorted.iterate(
        function(feature, list) {
        	// Keep key order same as @const headings
            return ee.List(list)
            	.add([feature.get(geoidTag), feature.get(priorityTag), feature.get(snapTag)]);
        },
        [headings]));
    return list;
}
