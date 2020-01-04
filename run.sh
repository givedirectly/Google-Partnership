while true; do
  git checkout flexible-test
  git pull
  yarn run cypress run --env ON_TRAVIS=1 --record --browser=electron --spec 'cypress/integration/unit_tests/polygon_draw_test.js'
done
