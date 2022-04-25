/* eslint-disable no-console */

import type { Context, S3Event, ScheduledEvent } from 'aws-lambda';
import S3 from 'aws-sdk/clients/s3';
// import {
//   createWriteStream,
//   existsSync,
//   mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync,
// } from 'fs';
import { writeFile } from 'fs/promises';

import { ClamAVService } from './clamAvService';
import { DEFINITION_FILES, DEFINITIONS_DIR } from './constants';
import { directoryExistsIsNotEmpty } from './utils';
import { VirusScan } from './virusScan';

const scanner = new VirusScan(new ClamAVService(), new S3());

const s3 = new S3();

const clamAvService = new ClamAVService();

const { DEFINITIONS_BUCKET = '' } = process.env;

async function scan(event: S3Event, _context: Context) {
  for (const record of event.Records) {
    if (!record.s3) {
      console.log('Not an S3 Record!');
      continue;
    }

    const s3BaseOptions = {
      Bucket: record.s3.bucket.name,
      Key: record.s3.object.key,
    };
    const temporaryFilePath = `/tmp/${record.s3.object.key}`;

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
      if (!(await directoryExistsIsNotEmpty(DEFINITIONS_DIR))) {
        console.log('Definitions not available locally');
        await getDefinitions();
      }

      // scan it
      try {
        await clamAvService.scan(`/tmp/${record.s3.object.key}`);
      } catch (error) {
        console.error(error);
        return;
      }

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

  if (!existsSync(DEFINITIONS_DIR)) {
    mkdirSync(DEFINITIONS_DIR, { recursive: true });
  }

  console.log('Fetching virus definitions');

  try {
    await Promise.all(
      DEFINITION_FILES.map((definition) => new Promise<void>((resolve, reject) => {
        const writeStream = createWriteStream(`${DEFINITIONS_DIR}/${definition}`);
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
  if (!existsSync(DEFINITIONS_DIR)) {
    mkdirSync(DEFINITIONS_DIR, { recursive: true });
  }

  console.log('Updating virus definitions');

  try {
    await clamAvService.freshclam();

    const files = readdirSync(DEFINITIONS_DIR)
      .map(
        (file) => ({ name: file, content: readFileSync(`${DEFINITIONS_DIR}/${file}`) }),
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
    unlinkSync(DEFINITIONS_DIR);
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
      await scanner.refreshDefinitions();
    }
  } else if (s3Event.Records) {
    await Promise.all(s3Event.Records
      .filter((record) => !!record.s3)
      .map((record) => scanner.scan(record.s3.object.key, record.s3.bucket.name)));
  }
}
