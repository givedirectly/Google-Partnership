set -x
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

# --diff-filter=dr excludes deleted and renamed files, which don't exist
# locally anymore.
# TODO(janakr): this is vulnerable to filenames with spaces.
modified_js_files="$(git diff --diff-filter=d --name-only \
    master 'docs/*.js' 'docs/import/*.js' 'cypress/integration/**/*.js' \
      'cypress/support/*.js' 'cypress/plugins/*.js')"
if [[ "$modified_js_files" ]]; then
  if clang-format --style=Google -output-replacements-xml $modified_js_files \
      | grep -c '<replacement ' >/dev/null; then
    echo 'Found badly formatted files. Run:'
    declare -a badfiles
    for eachfile in $modified_js_files; do
      clang-format --style=Google -output-replacements-xml $eachfile | grep -c '<replacement ' > /dev/null && badfiles+=($eachfile)
    done
    echo "clang-format -i --style=Google ${badfiles[@]}"
    exit 1
  fi
  yarn run eslint $modified_js_files
fi

exit 0
