/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
import type { Context, S3Event, ScheduledEvent } from 'aws-lambda';
import S3 from 'aws-sdk/clients/s3';
import { execSync } from 'child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync,
} from 'fs';

const s3 = new S3();

const definitionsDirectory = '/tmp/defs';
const definitions = [
  'bytecode.cvd',
  'daily.cvd',
  'main.cvd',
];

async function scan(event: S3Event, _context: Context) {
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

async function getDefinitions() {
  // TODO add check if we already have downloaded the definitions and if their checksums
  // match -> abort

  if (!existsSync(definitionsDirectory)) {
    mkdirSync(definitionsDirectory, { recursive: true });
  }

  await Promise.all(
    definitions.map((definition) => new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(`${definitionsDirectory}/${definition}`);
      const readStream = s3.getObject({ Bucket: 'clambda-av-definitions-demv', Key: definition }).createReadStream();

      readStream.on('end', () => resolve());
      readStream.on('error', (error) => reject(error));

      readStream.pipe(writeStream);
    })),
  );
}

async function updateDefinitions(): Promise<void> {
  if (!existsSync(definitionsDirectory)) {
    mkdirSync(definitionsDirectory, { recursive: true });
  }

  try {
    execSync(
      `./bin/freshclam --config-file=bin/freshclam.conf --datadir=${definitionsDirectory}`,
      {
        stdio: 'inherit',
        env: {
          LD_LIBRARY_PATH: './lib',
        },
      },
    );

    const files = readdirSync(definitionsDirectory)
      .map(
        (file) => ({ name: file, content: readFileSync(`${definitionsDirectory}/${file}`) }),
      );

    await Promise.all(
      files.map(
        (file) => s3.putObject(
          {
            Bucket: 'clambda-av-definitions-demv', Key: file.name, Body: file.content, ACL: 'public-read',
          },
        ).promise(),
      ),
    );
  } catch (error) {
    console.error(`Fetching new virus definitions failed!${error}`);
    unlinkSync(definitionsDirectory);
  }

  // TODO
  // 1. iterate over the downloaded definitions
  // 2. upload them to a s3 instance
  // 3. remove temp folder
}

export function virusScan(event: S3Event | ScheduledEvent, context: Context): void {
  console.log('event:', event, 'content:', context);
  // If not a S3 event either keep lamda warm or update the definitions
  if (!event.Records) {
    if (event.detail === 'warmer') {
      console.log('warmed');
      return;
    }

    if (event.detail === 'update') {
      console.log('Updating virus definitions');
      updateDefinitions();
    }

  // Must be an S3 event
  } else {
    updateDefinitions();
    scan(event as S3Event, context);
  }
}
