/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
import { S3 } from 'aws-sdk';
import { execSync } from 'child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'fs';

const s3 = new S3();

/**
 * @type {AWSLambda.S3Handler}
*/
async function scan(event, _context) {
  for (const record of event.Records) {
    if (!record.s3) {
      console.log('Not an S3 Record!');
      continue;
    }

    // get the file
    const s3Object = await s3
      .getObject({
        Bucket: record.s3.bucket.name,
        Key: record.s3.object.key,
      })
      .promise();

    // write file to disk
    writeFileSync(`/tmp/${record.s3.object.key}`, s3Object.Body);

    console.log(`Running virus check for '${record.s3.object.key}'`);

    try {
      // scan it
      execSync(`./bin/clamscan --database=./var/lib/clamav /tmp/${record.s3.object.key}`, { stdio: 'inherit' });

      console.log(`File ${record.s3.object.key} clean!`);

      await s3
        .putObjectTagging({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key,
          Tagging: {
            TagSet: [
              {
                Key: 'av-status',
                Value: 'clean',
              },
            ],
          },
        })
        .promise();
    } catch (error) {
      if (error.status === 1) {
        console.log(`File ${record.s3.object.key} dirty!`);

        // tag as dirty, OR you can delete it
        await s3
          .putObjectTagging({
            Bucket: record.s3.bucket.name,
            Key: record.s3.object.key,
            Tagging: {
              TagSet: [
                {
                  Key: 'av-status',
                  Value: 'dirty',
                },
              ],
            },
          })
          .promise();
      }
    }

    // delete the temp file
    unlinkSync(`/tmp/${record.s3.object.key}`);
  }
}

/**
 * @type {AWSLambda.ScheduledHandler}
 */
async function updateDefinitions(event, context) {
  const defsDir = '/tmp/defs';

  mkdirSync(defsDir, { recursive: true });

  try {
    execSync(
      `./bin/freshclam --config-file=bin/freshclam.conf --datadir=${defsDir}`,
      {
        stdio: 'inherit',
        env: {
          LD_LIBRARY_PATH: './lib',
        },
      },
    );
    console.log(execSync(`ls ${defsDir}`, { stdio: 'inherit' }));
  } catch (error) {
    console.error(`Fetching new virus definitions failed!${error}`);
    unlinkSync(defsDir);
  }

  // TODO
  // 1. iterate over the downloaded definitions
  // 2. upload them to a s3 instance
  // 3. remove temp folder
}

/**
 * @type {AWSLambda.Handler<AWSLambda.S3Event | AWSLambda.ScheduledEvent>}
 */
module.exports.virusScan = function (event, context) {
  console.log('event:', event, 'content:', context);
  // If not a S3 event either keep lamda warm or update the definitions
  if (!event.Records) {
    if (event.detail === 'warmer') {
      console.log('warmed');
      return;
    }

    if (event.detail === 'update') {
      console.log('Updating virus definitions');
      updateDefinitions(event, context, null);
    }

  // Must be an S3 event
  } else {
    console.log(event, context);
    scan(event, context, null);
  }
};
