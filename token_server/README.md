# Simple web server to provide EarthEngine tokens to non-whitelisted users

## Deploy to Google App Engine

* Follow initial steps for Google App Engine deployment: install `gcloud`, log
in as the GD user `gd-earthengine-user@givedirectly.org`, and set the gcloud
project to `mapping-crisis`. Helpful resource:
[NodeJS Quickstart](https://cloud.google.com/appengine/docs/standard/nodejs/quickstart).
Note that the project has already been created, so you don't need to do that
step, and the quickstart guide is for their toy project, not this one.

* Run `gcloud app deploy`. The app should now be running successfully at
https://mapping-crisis.appspot.com (note that directly accessing that URL is not
expected to work, since appropriate headers have to be attached to the request).

* The server should continue running forever, but will use few/no resources
unless it is getting traffic.

* The app was initially set up using the features described at
[NodeJS Runtime](https://cloud.google.com/appengine/docs/standard/nodejs/runtime).

* Billing and usage is available at the
[Dashboard](https://console.cloud.google.com/appengine?folder=&organizationId=838088520005&project=mapping-crisis).
You must be logged in as `gd-earthengine-user@givedirectly.org` to access it.

## Deploy to Amazon EC2

`¯\_(ツ)_/¯`

## Start locally
Run locally with `yarn start` from this directory, and change `TOKEN_SERVER_URL` in
`docs/authenticate.js` to `http://localhost:9080`.
