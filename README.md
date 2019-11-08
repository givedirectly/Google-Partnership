# Google - Partnership
Repository to store the work done by Google Fellows during 2019 

## Workflow for locally staging this work
* Download this git repository. You will probably have to add ssh keys to your
account so that you can access this repository. Googling "github add ssh keys"
is good enough. [Current instructions](https://help.github.com/en/articles/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
available. However, if you work for Google and get a failed command when you run
`ssh-add`, try specifying `/usr/bin/ssh-add`, since there is a Google-specific
`ssh-add` binary that otherwise gets invoked.

* Go to the [Firestore database](
https://console.firebase.google.com/project/mapping-crisis/database/firestore/data~2FALLOWED_USERS~2FALL_USERS)
when logged in as `gd-earthengine-user@givedirectly.org` and add your Google
account's email address to the list of users.

* Install [yarn](http://yarnpkg.com/) and run `yarn install` to install all
dependencies.

* Start the local web server by running
`yarn run ws --directory docs --port 8080`.

* Set `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/secret.json` in your
shell, most likely in your `~/.bashrc`. Get the service account .json file,
either from a collaborator or by logging into the [Service Accounts page](
https://console.cloud.google.com/iam-admin/serviceaccounts?project=mapping-test-data)
as `gd-earthengine-test-user@givedirectly.org` and generating a new key for
`firebase-adminsdk-j6emn@mapping-test-data.iam.gserviceaccount.com`. This is needed
for running tests. Remember to startup a new terminal window for changes to
take effect.

* Install [Chromium](https://www.chromium.org) if on Linux. Install via the
  usual `apt-get`-style channels. This should be relatively straightforward on
  most systems, but is difficult/impossible on Google-internal machines. If you
  have difficulty, you can [download a latest
  version](https://download-chromium.appspot.com) and unzip it. Then create a
  link, via `sudo ln -s /path/to/file/in/extracted/zip/named/chrome-wrapper
  /usr/bin/chromium` so that Cypress knows how to find it easily.

* Test changes locally.

    ```shell
    yarn run cypress run # --browser chromium ## (only needed on Linux) 
    ```

* Travis CI runs on each push to Github, unless the commit message has
'[skip ci]' inside it. You can trigger a run manually from the [Travis main
page](https://travis-ci.com/givedirectly/Google-Partnership). Runs are recorded
to the [Cypress dashboard](https://www.cypress.io/dashboard/).

* Save and share your personal test results in a web interface using
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

* Set up auto-lint: `cp pre-push-hook .git/hooks/pre-push`

* Run `clang-format` or `eslint` on all relevant files:

    ```shell
    # Following two lines only need to be run once per shell.
    shopt -s extglob
    SOURCE_FILES='client-side/static/!(ee_api_js_debug).js 
        cypress/integration/**/*.js cypress/support/!(commands).js'

    clang-format -i --style=Google $SOURCE_FILES
    yarn run eslint $SOURCE_FILES
    ```

