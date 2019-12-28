# Simple web server to provide EarthEngine tokens to non-whitelisted users

This is an optional component for the mapping page, that allows any user to view
it, even if they are not whitelisted with EarthEngine. Only the site maintainer
should follow the instructions below, and they should only need to be done once.

This server's location is unrelated to the mapping page's hosted location (The
mapping page's hosted location is
https://givedirectly.github.io/Google-Partnership as of January 2020). This
server is pointed to by the `TOKEN_SERVER_URL` of [authenticate.js](../docs/authenticate.js). If you
change the hosting location for this server, just update that variable.

## Run server on Google App Engine

* One-time only: [install `gcloud`](https://cloud.google.com/sdk/docs/).

* Run `gcloud app deploy --project mapping-crisis` from this directory
(`token_server/`). If you are not already authenticated in gcloud, it will give
you a command to run, probably `gcloud auth login`. Run it, logging in as
`gd-earthengine-user@givedirectly.org` and try again.

  The token server should now be running successfully at
  https://mapping-crisis.appspot.com (note that directly accessing that URL is
  not expected to work, since appropriate headers have to be attached to the
  request).

* The server should continue running forever, but will use few/no resources
unless it is getting traffic.

* The app was initially set up using the features described at
[NodeJS Runtime](https://cloud.google.com/appengine/docs/standard/nodejs/runtime).

* Billing and usage is available at the
[Dashboard](https://console.cloud.google.com/appengine?folder=&organizationId=838088520005&project=mapping-crisis).
You must be logged in as `gd-earthengine-user@givedirectly.org` to access it.

### Set up new Google Cloud instance
* Most of the necessary work needs to be done to set up the mapping page to work
properly in the first place. The only additional work is to create a service
account that is whitelisted for EarthEngine access (currently
`earthengine-token-provider`) and give it the "Service Account Token Creator" role
in the
[IAM page](https://console.developers.google.com/iam-admin/iam?project=mapping-crisis).

* If you are serving tokens from Google App Engine, and not from Amazon, then
you should also give the default AppEngine service account
(currently `mapping-crisis@appspot.gserviceaccount.com`) the "Service Account
Token Creator" role, so that it can create tokens for the service account you
created above.

## Run server on Amazon Elastic Beanstalk

* Deploy using [these instructions](https://aws.amazon.com/getting-started/tutorials/deploy-app-command-line-elastic-beanstalk/).
Since the project already exists on Amazon Elastic Beanstalk, you just need to
run `eb deploy` after running `eb init` in order to log in.

* The server URL will be entered here once we have GiveDirectly's account.

* See the [console](https://console.aws.amazon.com/) for more information. We
are using Elastic Beanstalk.

### Set up new Amazon Elastic Beanstalk instance
* See the [Google Cloud instructions](#set-up-new-google-cloud-instance) if that is
also changing.
* Delete the [.elasticbeanstalk](./.elasticbeanstalk) subdirectory of this directory, and follow the
instructions [here]((https://aws.amazon.com/getting-started/tutorials/deploy-app-command-line-elastic-beanstalk/)
to set up from scratch.
* Delete the `.gitignore` file that setup creates, and add `.elasticbeanstalk/*`
to git.
* Add Google service account credentials to
[Amazon Secrets Manager](https://aws.amazon.com/secrets-manager/getting-started/).
Remember that you need to be logged into Google as
`gd-earthengine-user@givedirectly.org`.
   * The Google service account is currently
`earthengine-token-provider@mapping-crisis.iam.gserviceaccount.com` (specified
in [ee_token_creator.js](./ee_token_creator.js).
   * Download private key JSON for the Google service account via the
   [Credentials page](https://console.developers.google.com/apis/credentials?project=mapping-crisis).
   * Upload to the [Amazon Secrets Manager](https://aws.amazon.com/secrets-manager/getting-started/)
   using the provided instructions.
To make the secret readable by the server, you will have to have the server run
as a user with permissions to read the secret:
  * [Instructions for creating the user](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/iam-instanceprofile.html#iam-instanceprofile-create).
  * [Give access only to this secret](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_identity-based-policies.html#permissions_grant-limited-resources)
  * After deploying the app, in the Elastic Beanstalk console, go to
  Configuration > Security > Modify and choose the IAM instance profile you
  created above.
  * Make sure the region you created the secret in matches the region specified
  in [token_server.js](./token_server.js)! 

## Start locally, for testing only

Run locally with `yarn start` from this directory, and change `TOKEN_SERVER_URL` in
`docs/authenticate.js` to `http://localhost:9080`.
