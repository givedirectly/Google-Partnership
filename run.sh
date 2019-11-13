git checkout wait-button
while true; do
  if git pull | grep 'Already up to date'; then
    sleep 5
  else
    yarn run cypress run --spec 'cypress/integration/unit_tests/polygon_draw_test.js' --env ON_TRAVIS=1 --record
  fi
done
