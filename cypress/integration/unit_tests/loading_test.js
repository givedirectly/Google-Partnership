import {setLoading} from '../../../client-side/static/loading.js';

describe('Unit test for loading_test.js', () => {
  beforeEach(() => {
    const mapLoaderDiv = document.createElement('div');
    mapLoaderDiv.id = 'mapContainer-loader';
    document.body.appendChild(mapLoaderDiv);

    const tableLoaderDiv = document.createElement('div');
    tableLoaderDiv.id = 'tableContainer-loader';
    document.body.appendChild(tableLoaderDiv);
  });

  it('adds the loading overlay', () => {
    setLoading('mapContainer', true);
    setLoading('tableContainer', true);

    expect(document.getElementById('mapContainer-loader').style.opacity)
        .to.equals('1');
    expect(document.getElementById('tableContainer-loader').style.opacity)
        .to.equals('1');
  });

  it('removes the loading overlay', () => {
    setLoading('mapContainer', false);
    setLoading('tableContainer', false);

    expect(document.getElementById('mapContainer-loader').style.opacity)
        .to.equals('0');
    expect(document.getElementById('tableContainer-loader').style.opacity)
        .to.equals('0');
  });
});
