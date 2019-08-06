const damage =
    ee.FeatureCollection('users/janak/FEMA_Damage_Assessments_Harvey_20170829');

// TODO(janakr): get raw Census data, and do the snap join in this
// script as well.
const rawSnap =
    ee.FeatureCollection('users/janak/texas-snap')
        .filterBounds(damage.geometry());

const buildings = ee.FeatureCollection('users/janak/census_building_data');

const censusSnapKey = 'ACS_16_5_4';
const censusTotalKey = 'ACS_16_5_2';

const damageKey = 'DMG_LEVEL';

// TODO(janakr): move this list into a common module.
const damageLevels = ee.List(['NOD', 'UNK', 'AFF', 'MIN', 'MAJ', 'DES']);

const damageFilters = damageLevels.map(
    function (type) {return ee.Filter.eq(damageKey, type)});

const zero = ee.Number(0);

function countDamage(feature) {
  const mainFeature = ee.Feature(feature.get('primary'));
  // TODO(janakr): #geometry() is deprecated?
  const geometry = mainFeature.geometry();
  const blockDamage = damage.filterBounds(geometry);
  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map(
          function (type) {return blockDamage.filter(type).size()})
  );
  return ee.Feature(
    geometry,
    attrDict
        .set('GEOID', mainFeature.get('GEOID'))
        .set('SNAP', mainFeature.get(censusSnapKey))
        .set('TOTAL', mainFeature.get(censusTotalKey))
        .set(
            'BUILDING_COUNT',
            ee.Feature(feature.get('secondary')).get('BUILDING_COUNT')));
}

function countBuildings(feature) {
  let totalBuildings = zero;
  // Columns in Census data: coming from inspection.
  for (let i = 1; i <= 11; i++) {
    // Let's not talk about padding with leading zeros.
    totalBuildings =
        totalBuildings.add(feature.get('HD01_VD' + (i < 10 ? '0' + i : i)));
  }
  return ee.Feature(
      feature.geometry(),
      ee.Dictionary([
          // TODO(janakr): when we're processing data from scratch, this won't
          // be a string on the other side, so we can leave it as is here.
          'GEOID', ee.String(feature.get('GEOid2')),
          'BUILDING_COUNT', totalBuildings]));
}

function run() {
  ee.initialize();
  const processedBuildings = buildings.map(countBuildings);
  const joinedSnap =
      ee.Join.inner().apply(rawSnap,
                            processedBuildings,
                            ee.Filter.equals(
                                {leftField: 'GEOID', rightField: 'GEOID'}));
  const task = ee.batch.Export.table.toAsset(
      joinedSnap.map(countDamage),
      'texas-snap-join-damage',
      'users/janak/texas-snap-join-damage-test-lists-2');
  task.start();
  $('.upload-status')
      .text('Check Code Editor console for progress. Task: ' + task.id);
  joinedSnap.size().evaluate(
      function (val, failure) {
        if (val) {
          $('.upload-status').append('\n<p>Found ' + val + ' elements');
        } else {
          $('.upload-status').append('\n<p>Error getting size: ' + failure);
        }
  });
}

// Runs immediately (before document may have fully loaded). Adds a hook so that
// when the document is loaded, we do the work.
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s.apps.googleusercontent.com';
  // const CLIENT_ID = '628350592927-tmcoolr3fv4mdbodurhainqobc6d6ibd.apps.googleusercontent.com';

  $(document).ready(function() {
    // Shows a button prompting the user to log in.
    const onImmediateFailed = function() {
      $('.g-sign-in').removeClass('hidden');
      $('.output').text('(Log in to see the result.)');
      $('.g-sign-in .button').click(function() {
        ee.data.authenticateViaPopup(function() {
          // If the login succeeds, hide the login button and run the analysis.
          $('.g-sign-in').addClass('hidden');
          run();
        });
      });
    };

    // Attempt to authenticate using existing credentials.
    ee.data.authenticate(CLIENT_ID, run, null, null, onImmediateFailed);
  });
};

setup();
