set -e
# Call this file from .git/hooks/pre-push to activate it. Put
# "./pre-push-hook.sh" as the only content of that file.
#
# A script to verify expected code style and state.
# TODO(janakr): add configuration to disable individual checks.

# Prevent pushes with a dirty working directory. User can still accidentally
# fail to push some changes if there are no other commits to push, because
# this trigger won't even be hit then (git will say everything is up to date).
if [[ $(git diff --name-only HEAD) ]]; then
  echo "Uncommitted changes exist: "
  git diff --name-only HEAD
  exit 1
fi

./lint.sh

