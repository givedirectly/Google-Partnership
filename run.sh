while true; do
  git pull retry-tests
  ./inner_run.sh
done
