const { execSync } = require("child_process");
const { writeFileSync, unlinkSync } = require("fs");
const S3 = require("aws-sdk/clients/s3");

const s3 = new S3();

/**
 * @type {AWSLambda.S3Handler}
 */
module.exports.virusScan = async (event, context) => {
  if (!event.Records) {
    console.log("Not an S3 event invocation!");
    return;
  }

  for (const record of event.Records) {
    if (!record.s3) {
      console.log("Not an S3 Record!");
      continue;
    }

    // get the file
    const s3Object = await s3
      .getObject({
        Bucket: record.s3.bucket.name,
        Key: record.s3.object.key
      })
      .promise();

    // write file to disk
    writeFileSync(`/tmp/${record.s3.object.key}`, s3Object.Body);

    try {
      // scan it
      execSync(`./bin/clamscan --database=./var/lib/clamav /tmp/${record.s3.object.key}`, { stdio: "inherit" });

      console.log(`File ${record.s3.object.key} clean!`);

      await s3
        .putObjectTagging({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key,
          Tagging: {
            TagSet: [
              {
                Key: 'av-status',
                Value: 'clean'
              },
            ]
          }
        })
        .promise();
    } catch(err) {
      if (err.status === 1) {
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
                  Value: 'dirty'
                }
              ]
            }
          })
          .promise();
      }
    }

    // delete the temp file
    unlinkSync(`/tmp/${record.s3.object.key}`);
  }
};
