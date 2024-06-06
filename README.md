# Google - Partnership

Repository to store the work done by Google Fellows during 2019

*   This project uses [yarn](http://yarnpkg.com/) for dependency management.
    Install and run `yarn install` to install all dependencies. If you ever see
    an issue with missing dependencies, try running this command again.

## Making changes and locally staging

*   Go to the
    [Firestore database](https://console.firebase.google.com/project/mapping-crisis/database/firestore/data~2FALLOWED_USERS~2FALL_USERS)
    while logged in as `gd-earthengine-user@givedirectly.org` and add your
    Google account's email address to the list of users. This will give you
    access to user-drawn features on the disaster map.

*   Download this git repository. You will probably have to add ssh keys to your
    account so that you can access this repository. Googling "github add ssh
    keys" is good enough.
    [Current instructions](https://help.github.com/en/articles/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
    available. However, if you work for Google and get a failed command when you
    run `ssh-add`, try specifying `/usr/bin/ssh-add`, since there is a
    Google-specific `ssh-add` binary that otherwise gets invoked.

*   Start the local web server by running `yarn run ws --directory docs --port
    8080`. and visit the page at `localhost:8080` (we recommend in Chrome).

*   In order to view all features without incurring server traffic expenses,
    [sign up](https://earthengine.google.com/) to whitelist yourself with earth
    engine (usually takes ~1-2 business days to get approved).

*   Install `clang-format`, probably using
    [`brew install clang-format`](https://brew.sh).

*   Set up auto-lint:
    `echo ./pre-push-hook.sh > .git/hooks/pre-push && chmod +x ./git/hooks/pre-push`

*   *[Optional]* Run `./lint.sh --fix` to run clang-format and eslint on all
    relevant files and (with `--fix`) format in place. Clang-format checking and
    eslint will run automatically on `git push` (without `--fix`) so this just
    saves you the extra commits.

## Running tests

*   [Node](https://nodejs.org/) 20 is required to run tests. You can install it
    on Macs in various ways. The [nvm](https://github.com/nvm-sh/nvm) manager is
    recommended.

*   A service account secret .json file is used to credential the test runner.
    Get the file either from a collaborator or by logging into the
    [Service Accounts page](https://console.cloud.google.com/iam-admin/serviceaccounts?project=mapping-test-data)
    as `gd-earthengine-test-user@givedirectly.org` and generating a new key for
    `firebase-adminsdk-j6emn@mapping-test-data.iam.gserviceaccount.com`.

*   Save the file locally somewhere *outside* of your local download of this
    repository.

*   Set `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/secret.json` in your
    shell (most likely in your `~/.bashrc` on linux, `~/.bash_profile` on mac).
    Remember to startup a new terminal window for changes to take effect.

*   Start the local web server as described above.

*   Test changes locally. (`ELECTRON_ENABLE_LOGGING=1` prints the Javascript
    console log to your terminal when running the Electron browser.)

    ```shell
    ELECTRON_ENABLE_LOGGING=1 yarn run cypress run # --browser chrome ## (only needed on Linux)
    ```

*   *[Optional]* Travis CI runs on each push to a PR, unless the commit message
    has '[skip ci]' inside it. You can trigger a run manually from the
    [Travis main page](https://travis-ci.com/givedirectly/Google-Partnership).
    Runs are recorded to the
    [Cypress dashboard](https://www.cypress.io/dashboard/).

*   *[Optional]* Ask a collaborator to add you to the existing Cypress dashboard
    for this project. The dashboard tracks Travis CI runs and provides easy
    access to output files, footage of the test being run, etc.

*   *[Optional]* If you are running on Linux and seeing issues with Chrome, or
    working on a Google internal machine, install and use
    [Chromium](https://www.chromium.org) for tests. Install via the usual
    `apt-get`-style channels. This should be relatively straightforward on most
    systems, but is difficult/impossible on Google-internal machines. If you
    have difficulty, you can
    [download a latest version](https://download-chromium.appspot.com) and unzip
    it. Then create a link, via `sudo ln -s
    /path/to/file/in/extracted/zip/named/chrome-wrapper /usr/bin/chromium` so
    that Cypress knows how to find it easily.

*   For more details on our testing setup, see the [README](cypress/README.md).

## Other tools

*   *[Optional]* Install `ogr2ogr` command line tool (part of the gdal library)
    if you ever need to convert between geo-data types. This will most often be
    used to convert geo data to
    [earth engine-friendly formats](https://developers.google.com/earth-engine/asset_manager).

    ```shell
    brew install gdal
    ogr2ogr -f "ESRI Shapefile" destination_data.shp "source-data.json"
    ```

## Helpful Links

*   [git documentation](https://git-scm.com/docs)
*   [cypress test-running documentation](https://docs.cypress.io/guides/guides/command-line.html#cypress-run)
*   [ogr2ogr documentation](https://gdal.org/programs/ogr2ogr.html)

## License

[![license](https://img.shields.io/badge/license-MIT-green.svg)](/LICENSE)

This project is licensed under the terms of the [MIT license](/LICENSE).
