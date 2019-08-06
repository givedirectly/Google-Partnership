import {snapTag} from './script.js';

export {drawDashboard as default };

// Percentage at which to initially cutoff poverty level.
const povertyCutoff = 30;

function drawDashboard(features, id, filterBy) {
    const dashboard = new google.visualization.Dashboard(document.getElementById('dashboard'));
    const table = new google.visualization.ChartWrapper({
        'chartType': 'Table',
        'containerId': 'table',
        'view': {'columns': [0, 2]},
        // TODO(juliexxia): add style options
    });
    const povertySlider = new google.visualization.ControlWrapper({
        'controlType': 'NumberRangeFilter',
        'containerId': 'poverty-slider',
        'options': {
            'filterColumnLabel': snapTag,
        },
        // SNAP precentage cutoff = 30%
        'state': {'lowValue': povertyCutoff, 'highValue': 100}
    });
    dashboard.bind(povertySlider, table);

    const list = getTableData(features, id, filterBy);
    list.evaluate(function(success, failure) {
        if (typeof failure !== 'undefined') {
            // TODO(juliexxia): more robust error reporting
            // https://developers.google.com/chart/interactive/docs/reference#errordisplay
            console.log(failure);
        } else {
            const data = google.visualization.arrayToDataTable(success, false);
            // Instantiate and draw the chart.
            if (typeof data !== 'undefined') {
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
function getTableData(features, id, property) {
    //TODO(#5): make this settable via ui widget
    const MAX_ENTRIES = 25

    const sortedAndLimited = features.limit(MAX_ENTRIES, property, false /* descending order */ );

    const headings = [
        [id, snapTag, property]
    ];
    const list = ee.List(sortedAndLimited.iterate(
        function(feature, list) {
            return ee.List(list)
            	.add([feature.get(id), feature.get(snapTag), feature.get(property)]);
        },
        headings));
    return list;
}