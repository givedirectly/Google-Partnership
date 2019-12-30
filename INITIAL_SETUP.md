# Instructions for Initial Setup

## Moving to a different server for the mapping page

Our current server setup is Github Pages. We serve from the `master` branch,
`docs` folder:
![github pages setup screenshot](./markdown_images/github_pages.png)

Because the application is all client-side JavaScript, any static web host
(Wordpress, a blog, etc.) should work as a server. Simply copy all the files
from [docs/](./docs) and below to the location you're serving from.

To make the [Token Server](./token_server/README.md) work with the new location,
you must update the `allowedOrigins` field in
[token_server.js](./token_server/token_server.js) to be the new server's domain.

## Moving to a different Google account/Changing server setup

While the application is client-side JavaScript, it talks to two Google
services, EarthEngine and Firestore. The resources it accesses are owned by the
"Admin account", `gd-earthengine-user@givedirectly.org`, but can be accessed
by any EarthEngine-whitelisted user, and by any Google user, respectively (some
Firestore data is available only to specific users, see below).

You should not need to change that, but if for some reason you need to set up a
new instance of this (if you are a different organization, for instance), read
on. You may also find this helpful when troubleshooting, or adding/modifying
Google services.

1. Create a Google account and sign into it. This is your new Admin account. All
  the remaining steps should be done while logged into this account, ideally in
  a browser window that isn't logged into any other account, for simplicity.

1. Request [EarthEngine whitelisting](https://signup.earthengine.google.com/#!/)
  of this Admin account.

1. Go to https://console.firebase.google.com/. You should have to create a
  project. Currently, the project is "mapping-crisis". You don't need to enable
  Google Analytics or anything else fancy: we are only using this as data
  storage. Once the project is created, click on "Database" and "Create
  database".

1. Follow instructions to
[modify/set up firestore rules](#modifyset-up-firestore-rules).

1. Go to the Firestore database. To get there, click on "Database" in the left-
  hand sidebar.
  [Here](https://firebase.corp.google.com/project/mapping-crisis/database/firestore/data~2F)
  is the current page.

1. Create a collection called `ALLOWED_USERS`. In that collection, create a
  document called `ALL_USERS`. In that document, create a field of array type
  called `USERS`. To that array, add the email addresses of users who should be
  able to view/edit user-defined features on the map. The current data looks
  like: ![allowed users screenshot](./markdown_images/allowed_users.png)

1. Go to [Credentials](https://console.developers.google.com/apis/credentials),
  or "Credentials" under https://console.developers.google.com/ if that link
  does not work.

1. Setting up an API Key.
  - You should see an "API Keys" section, and under that "Browser key (auto
    created by Firebase)", or similar:
    ![credentials browser key screenshot](./markdown_images/credentials_browser_key.png)
    Click on it.

  - Rename the key so it's easier to track (for instance, the current key is
  called "Mapping browser key") and set API restrictions. Choose the following
  five APIs:
    - Maps JavaScript API
    - Google Earth Engine API
    - Identity Toolkit API
    - Places API
    - Token Service API (only needed for optional token server component)
  
    ![key apis screenshot](./markdown_images/key_apis.png)
  
    Remember to save your changes!

  - Copy the API key to the `API_KEY` constant in 
    [common_auth_utils.js](./docs/common_auth_utils.js). Also copy it at the end
    of the `script` tag for the Maps API in [index.html](./docs/index.html),
    [manage_disaster.html](./docs/import/manage_disaster.html), and
    [script_loader.js](./cypress/support/script_loader.js).

1. Setting up OAuth client ID.
  - Go back to the
    [Credentials](https://console.developers.google.com/apis/credentials) page.
    Below the "API Keys" section is an OAuth 2.0 Client IDs section. It may be
    empty if you have just created this account, or have an auto-generated one.
      - If it is empty, click on "CREATE CREDENTIALS" at the top of the page,
        and choose "OAuth client ID". Specify "Web application". Then continue
        below.
      - If there is an auto-generated one, click on it.
  
  - Give it a useful name (the current one is "Disaster relief mapping").
  
  - Specify "Authorized JavaScript origins". Currently they are
    `http://localhost:8080` for local development and
    `https://givedirectly.github.io`. This second origin should be the domain
    that the mapping page is hosted on.
  
  - Specify "Authorized redirect URIs". You must list here every page that a
    normal user or the Admin user might go to, including when managing a
    disaster. Currently, it is `http://localhost:8080`,
    `http://localhost:8080/`, `http://localhost:8080/manage_disaster.html`,
    `http://localhost:8080/manage_layers.html`,
    `https://givedirectly.github.io/Google-Partnership/import/manage_disaster.html`,
    `https://givedirectly.github.io/Google-Partnership/import/manage_layers.html`,
    `https://givedirectly.github.io/Google-Partnership/`,
    `https://givedirectly.github.io/Google-Partnership`. Save your changes.

  - Screenshot of current state for the instructions above:
  ![client id screenshot](./markdown_images/client_id.png)

  - Copy the "Client ID" field to the `CLIENT_ID` constant in
    [common_auth_utils.js](./docs/common_auth_utils.js) and
    [token_server.js](./token_server/token_server.js).

### Set up testing infrastructure

In order to successfully run tests, locally or on
[Travis CI](https://travis-ci.com/givedirectly/Google-Partnership/), a Test
account must be set up, and developers and Travis must have access to its
credentials. The current Test account is
`gd-earthengine-test-user@givedirectly.org`.

* If you need to create a new Test account, follow the first four steps of
  [Moving to a different Google account/Changing server setup](#Moving to a different Google account/Changing server setup):
  create an account and whitelist it, create a Firestore database and initialize
  its rules. Note that the test project's name can/should be different from the
  prod name: currently the test project's name is `mapping-test-data`. Similarly
  in the [Modify/set up Firestore rules](#Modify/set up Firestore rules)

 
### Modify/set up Firestore rules

* One-time: install `firebase-tools` globally: `yarn global add firebase-tools`.

* Go to the [firestore_rules/prod](./firestore_rules/prod) subdirectory.

* Run `firebase login` and log in as the Admin user.

* If desired, edit Firestore rules at
  [firestore_rules/prod/firestore.rules](./firestore_rules/prod/firestore.rules).
  See
  [rules documentation](https://firebase.google.com/docs/firestore/security/rules-structure).

* Deploy rules by running
  `firebase deploy --project mapping-crisis --only firestore:rules`. If
  the project name has changed, specify it instead of `mapping-crisis`.

* To edit/deploy test rules, switch to the
  [firestore_rules/test](./firestore_rules/test) subdirectory and repeat. This
  time, you will have to log in as the test user.

* If the project is no longer `mapping-crisis`, you may have to modify the
  [.firebaserc](./firestore_rules/prod/.firebaserc) file, but should not need
  to.