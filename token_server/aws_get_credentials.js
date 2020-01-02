import AWS from 'aws-sdk';
import fs from 'fs';
import tmp from 'tmp';

export {storeGoogleCredentials};

const AWS_REGION = 'us-east-1';

// See instructions in README.md for where this comes from.
const SECRET_ID = 'arn:aws:secretsmanager:us-east-1:560508828482:secret:' +
    'GoogleServiceAccountJson-EXtSJ9';

const client = new AWS.SecretsManager({region: AWS_REGION});

/**
 * Loads credentials from AWS Secrets Manager and write them to a temp file,
 * then sets `GOOGLE_APPLICATION_CREDENTIALS` environment variable to that file
 * so Google libraries will pick it up.
 *
 * Secrets Manager code this is based on:
 * https://docs.aws.amazon.com/code-samples/latest/catalog/javascript-secrets-secrets_getsecretvalue.js.html
 * @return {Promise<void>} Promise that is done when environment variable is set
 *     to temp file
 */
function storeGoogleCredentials() {
  return new Promise(
      (resolve, reject) =>
          client.getSecretValue({SecretId: SECRET_ID}, (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            tmp.file((err, path) => {
              if (err) {
                reject(err);
                return;
              }
              fs.writeFile(path, data.SecretString, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
                resolve();
              });
            });
          }));
}
