# Google - Partnership
Repository to store the work done by Google Fellows during 2019 

## Workflow for locally staging this work
* Download Google Cloud SDK. You may have to create a new project.
https://cloud.google.com/sdk/docs/quickstarts

* Download this git repository. You will probably have to add ssh keys to your
account so that you can access this repository. Googling "github add ssh keys"
is good enough. [Current instructions](https://help.github.com/en/articles/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
available. However, if you work for Google and get a failed command when you run
`ssh-add`, try specifying `/usr/bin/ssh-add`, since there is a Google-specific
`ssh-add` binary that otherwise gets invoked.

* `dev_appserver.py` lives wherever cloud SDK was downloaded so find it

    ```shell
    gcloud info --format="value(installation.sdk_root)"

    ```

* Run `dev_appserver.py` from `client-side/`, which contains the `.yaml` file:

    ```shell
    cd client-side/
    path/from/last/command/bin/dev_appserver.py .
    ```

  Keep this running in your shell for all future steps.

* Install [yarn](http://yarnpkg.com/).

* Install [Chromium](https://www.chromium.org).
  * On Mac, `brew cask install chromium` should work if you have
  [Homebrew](https://brew.sh) installed.
  [FreeSMUG](http://freesmug.org/chromium) also offers a pre-built `.dmg`
  installer.
  * On Linux, install via the usual `apt-get`-style channels. This should be
  relatively straightforward on most systems, but is difficult/impossible on
  Google-internal machines. If you have difficulty, you can [download a latest
  version](https://download-chromium.appspot.com) and unzip it. In this
  case, you will have to change `--browser chromium` to `--browser
  path/to/file/in/extracted/zip/named/chrome-wrapper` in all later commands and
  in your .git/hooks/pre-push file below.

* Test changes.

    ```shell
    cd the/directory/this/README/is/in
    yarn install # Just once, to make sure everything is installed.
    yarn run mocha
    yarn run cypress run --browser chromium
    ```

* Save and share test results in a web interface using
[Cypress dashboard](https://www.cypress.io/dashboard/). The dashboard also
provides easy access to output files, footage of the test being run, etc. To find
the record key for this project go to the Google-Partnership project at
https://dashboard.cypress.io in the "Runs" tab under "Settings".
  
    ```shell
    yarn run cypress run --record --key <record-key>
    # or set record key as environment variable
    export CYPRESS_RECORD_KEY=<record key>
    yarn run cypress run --record
    ```

* Install `clang-format`, probably using [`brew install clang-format`](https://brew.sh).

* Set up auto-test-and-lint.

    ```shell
    cd this/directory
    cp pre-push-hook .git/hooks/pre-push
    ```

* Run `clang-format` or `eslint` on all relevant files:

    ```shell
    # Following two lines only need to be run once per shell.
    shopt -s extglob
    SOURCE_FILES='client-side/static/!(ee_api_js_debug).js 
        cypress/integration/**/*.js cypress/support/!(commands).js'

    clang-format -i --style=Google $SOURCE_FILES
    yarn run eslint $SOURCE_FILES
    ```

