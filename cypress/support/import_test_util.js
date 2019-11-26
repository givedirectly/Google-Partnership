import {disasterData} from '../../docs/import/add_disaster_util';

export {createTrs, setDisasterAndLayers};

/**
 * Creates some amount of table rows with a .index-td td.
 * @param {number} num
 * @return {Array<JQuery<HTMLElement>>}
 */
function createTrs(num) {
  const rows = [];
  for (let i = 0; i < num; i++) {
    rows.push(
        $(document.createElement('tr'))
            .append(
                $(document.createElement('td')).addClass('index-td').text(i)));
  }
  return rows;
}

/**
 * Sets local storage to point to disaster with the given layers.
 * @param {Array<Object>} layers
 */
function setDisasterAndLayers(layers) {
  const currentDisaster = '2005-fall';
  disasterData.set(currentDisaster, {layers: layers});
  window.localStorage.setItem('disaster', currentDisaster);
}