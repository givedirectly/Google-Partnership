# Instructions for Initial Setup

## Moving to a different server for the mapping page

Because the application is all client-side JavaScript, any static web host
(Wordpress, a blog, etc.) should work as a server. Simply copy all the files
from [docs/](./docs) and below to the location you're serving from.

Our current server setup is Github Pages. We serve from the `master` branch,
`docs` folder:
!(https://user-images.githubusercontent.com/10134896/67606660-1697c400-f750-11e9-93ad-c9c4bd725c6d.png).

To make the [Token Server](./token_server/README.md) work with the new location,
you must update the `allowedOrigins` field in
[token_server.js](./token_server/token_server.js) to be the new server's domain.

## Moving to a different Google account

While the application is client-side JavaScript, it talks to two Google
services, EarthEngine and Firestore. The resources it accesses are owned by
`gd-earthengine-user@givedirectly.org`, but can be accessed by any
EarthEngine-whitelisted user, and by any Google user, respectively (some
Firestore data is available only to specific users, see below).

You should not need to change that, but if for some reason you need to set up a
new instance of this (if you are a different organization, for instance), read
on. You may also find this helpful when troubleshooting.

* Create a Google account and sign into it. Then go to
  https://console.firebase.google.com/. You should have to create a project.
  Currently, the project is "mapping-crisis". You don't need to enable Google
  Analytics or anything else fancy: we are only using this as data storage. Once
  the project is created, click on "Database" and "Create database".

* Follow instructions to
[modify/set up firestore rules](#modifyset-up-firestore-rules).


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