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

* dev_appserver.py lives wherever cloud SDK was downloaded so find it

```shell
gcloud info --format="value(installation.sdk_root)"

```

* Run dev_appserver.py from `client-side`, which contains the `.yaml` file

```shell
cd client-side/
path/from/last/command/bin/dev_appserver.py .
```

* Install [yarn](http://yarnpkg.com/).

* Test changes.

```shell
cd this/directory
yarn run cypress run
```

* Set up auto-test-and-lint.

```shell
cd this/directory
cp pre-push-hook .git/hooks/pre-push
```
