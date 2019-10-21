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

* Set `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/secret.json` in your
shell, most likely in your `~/.bashrc`. Get the service account .json file,
either from a collaborator or by logging into the [Service Accounts page](
https://console.cloud.google.com/iam-admin/serviceaccounts?project=mapping-crisis)
as `gd-earthengine-user@givedirectly.org` and generating a new key for
`firebase-adminsdk-pw40g@mapping-crisis.iam.gserviceaccount.com`. This is needed
for running tests.

* Install [Chromium](https://www.chromium.org) if on Linux. Install via the
  usual `apt-get`-style channels. This should be relatively straightforward on
  most systems, but is difficult/impossible on Google-internal machines. If you
  have difficulty, you can [download a latest
  version](https://download-chromium.appspot.com) and unzip it. Then create a
  link, via `sudo ln -s /path/to/file/in/extracted/zip/named/chrome-wrapper
  /usr/bin/chromium` so that Cypress knows how to find it easily.

* Test changes.

    ```shell
    cd the/directory/this/README/is/in
    yarn install # Just once, to make sure everything is installed.
    yarn run cypress run # --browser chromium ## (only needed on Linux) 
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

* Set up auto-test-and-lint. You may need to modify pre-push to pass `--browser
  chromium` if running on Linux.

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

