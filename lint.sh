set -e
# A script to verify expected code style. Exits with code 2
# for style failures.
# TODO(janakr): add configuration to disable individual checks.

readonly first_arg="$1"
# --diff-filter=dr excludes deleted and renamed files, which don't exist
# locally anymore.
# TODO(janakr): this is vulnerable to filenames with spaces.
readonly modified_js_files="$(git diff --diff-filter=d --name-only \
    master 'docs/*.js' 'docs/import/*.js' 'cypress/integration/**/*.js' \
      'cypress/support/*.js' 'cypress/plugins/*.js')"
if [[ "$modified_js_files" ]]; then
  if clang-format --style=Google -output-replacements-xml $modified_js_files \
      | grep -c '<replacement ' >/dev/null; then
    declare -a badfiles
    for eachfile in $modified_js_files; do
      clang-format --style=Google -output-replacements-xml $eachfile | grep -c '<replacement ' > /dev/null && badfiles+=($eachfile)
    done
    if [[ "$first_arg" == "--fix" ]]; then
      echo "Auto-formatting ${badfiles[@]}"
      clang-format -i --style=Google ${badfiles[@]}
      ./lint.sh
    else
      echo 'Found badly formatted files. Run:'
      echo "clang-format -i --style=Google ${badfiles[@]}"
    fi
    exit 2
  fi
  yarn run eslint $modified_js_files || exit 2
fi

exit 0
