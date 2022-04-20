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

const { DEFINITIONS_BUCKET = '' } = process.env;

function definitionsLocallyAvailable(): boolean {
  // TODO add md5 check
  try {
    return existsSync(definitionsDirectory) && readdirSync(definitionsDirectory).length > 0;
  } catch {
    return false;
  }
}

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
      // check for virus definitions first
      if (!definitionsLocallyAvailable()) {
        console.log('Definitions not available locally');
        await getDefinitions();
      }

      // scan it
      execSync(`./bin/clamscan --database=${definitionsDirectory} /tmp/${record.s3.object.key}`, { stdio: 'inherit' });

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

  console.log('Fetching virus definitions');

  try {
    await Promise.all(
      definitions.map((definition) => new Promise<void>((resolve, reject) => {
        const writeStream = createWriteStream(`${definitionsDirectory}/${definition}`);
        const readStream = s3.getObject({ Bucket: DEFINITIONS_BUCKET, Key: definition }).createReadStream();

        readStream.on('end', () => resolve());
        readStream.on('error', (error) => reject(error));

        readStream.pipe(writeStream);
      })),
    );
  } catch (error) {
    console.error(`Fetching virus definitions failed:\n\n${error}`);
    return;
  }

  console.log('Finished fetching virus definitions');
}

async function updateDefinitions(): Promise<void> {
  if (!existsSync(definitionsDirectory)) {
    mkdirSync(definitionsDirectory, { recursive: true });
  }

  console.log('Updating virus definitions');

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
            Bucket: DEFINITIONS_BUCKET, Key: file.name, Body: file.content, ACL: 'public-read',
          },
        ).promise(),
      ),
    );

    console.log('Finished updating virus definitions');
  } catch (error) {
    console.error(`Updating virus definitions failed:\n\n${error}`);
    unlinkSync(definitionsDirectory);
  }
}

export async function virusScan(event: unknown, context: Context): Promise<void> {
  // TypeScript cannot infer correct properties since S3Event and ScheduledEvent have
  // almost no overlap. Therefore we cast here to get proper type hinting.
  const scheduledEvent = event as ScheduledEvent;
  const s3Event = event as S3Event;

  if (scheduledEvent.source || scheduledEvent.resources) {
    const isWarmer = scheduledEvent.source === 'serverless-plugin-warmup';
    const isUpdater = scheduledEvent.resources && scheduledEvent.resources.some(
      (resource) => resource.includes('update-virus-definitions-schedule'),
    );

    if (isWarmer) {
      console.log('warmed');
      return;
    }

    if (isUpdater) {
      await updateDefinitions();
    }
  } else if (s3Event.Records) {
    await scan(s3Event, context);
  }
}
