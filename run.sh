git checkout wait-button
while true; do
  if git pull | grep 'Already up to date'; then
    sleep 5
  else
    ./inner_run.sh
  fi
done
