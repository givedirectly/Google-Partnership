# Google-Partnership
Repository to store the work done by Google Fellows during 2019 

## Workflow for locally staging this work
<pre><code>
# download Google Cloud SDK
# https://cloud.google.com/sdk/docs/quickstarts

# dev_appserver.py lives wherever cloud SDK was downloaded so find it
$ gcloud info --format="value(installation.sdk_root)"

# run dev_appserver.py from same directory as the .yaml file
$ cd dir/with/yaml/file
$ path/from/last/command/bin/dev_appserver.py .
</code></pre>
