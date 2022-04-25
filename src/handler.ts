/* eslint-disable no-console */

import type { Context, S3Event, ScheduledEvent } from 'aws-lambda';
import S3 from 'aws-sdk/clients/s3';

import { ClamAVService } from './clamAvService';
import { VirusScan } from './virusScan';

const scanner = new VirusScan(new ClamAVService(), new S3());

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
