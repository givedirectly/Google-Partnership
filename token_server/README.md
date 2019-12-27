# Simple web server to provide EarthEngine tokens to non-whitelisted users

This is an optional component for the mapping page, that allows any user to view
it, even if they are not whitelisted with EarthEngine. Only the site maintainer
should follow the instructions below, and they should only need to be done once.

This server's location is unrelated to the mapping page's hosted location (The
mapping page's hosted location is
https://givedirectly.github.io/Google-Partnership as of January 2020). This
server is pointed to by the `TOKEN_SERVER_URL` of `docs/authenticate.js`. If you
change the hosting location for this server, just update that variable.

## Run server on Google App Engine

* One-time only: [install `gcloud`](https://cloud.google.com/sdk/docs/).

* Run `gcloud app deploy --project mapping-crisis` from this directory
(`token_server/`). If you are not already authenticated in gcloud, it will give
you a command to run, probably `gcloud auth login`. Run it, logging in as
`gd-earthengine-user@givedirectly.org` and try again. The token server should now
be running successfully at https://mapping-crisis.appspot.com (note that directly
accessing that URL is not expected to work, since appropriate headers have to be
attached to the request).

* The server should continue running forever, but will use few/no resources
unless it is getting traffic.

* The app was initially set up using the features described at
[NodeJS Runtime](https://cloud.google.com/appengine/docs/standard/nodejs/runtime).

* Billing and usage is available at the
[Dashboard](https://console.cloud.google.com/appengine?folder=&organizationId=838088520005&project=mapping-crisis).
You must be logged in as `gd-earthengine-user@givedirectly.org` to access it.

## Run server on Amazon EC2

`¯\_(ツ)_/¯`

## Start locally, for testing only

Run locally with `yarn start` from this directory, and change `TOKEN_SERVER_URL` in
`docs/authenticate.js` to `http://localhost:9080`.
