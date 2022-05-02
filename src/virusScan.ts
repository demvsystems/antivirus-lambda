/* eslint-disable no-console */
import type S3 from 'aws-sdk/clients/s3';
import {
  createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync,
} from 'fs';

import { IScanService } from './clamAvService';

const { DEFINITIONS_BUCKET = '' } = process.env;

export interface IVirusScan {
  scan(key: string, bucket: string): Promise<void>
  refreshDefinitions(): Promise<void>
  fetchDefinitions(): Promise<void>
  definitionsAvailable(): boolean
}

export class VirusScan implements IVirusScan {
  constructor(
    private scanService: IScanService,
    private s3: S3,
  ) {}

  async scan(key: string, bucket: string): Promise<void> {
    const filePath = await this.fetchBucketFile(key, bucket);

    if (!this.definitionsAvailable()) {
      console.log('Definitions not available');
      await this.fetchDefinitions();
    }

    try {
      console.log(`Running virus check for '${key}'`);

      const clean = await this.scanService.scan(filePath);

      if (clean) {
        console.log(`File ${key} clean!`);
        await this.tagBucketFile(key, bucket, 'clean');
      } else {
        console.log(`File ${key} dirty!`);
        await this.tagBucketFile(key, bucket, 'dirty');
      }
    } catch (error) {
      console.error(`Scanning file '${key}' failed:\n\n${error}`);
    } finally {
      unlinkSync(filePath);
    }
  }

  async refreshDefinitions(): Promise<void> {
    console.log('Updating virus definitions');

    const { dir } = this.scanService.getDefinitionsInfo();

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      await this.scanService.updateDefinitions();
      await this.uploadDefinitions();
      console.log('Finished updating virus definitions');
    } catch (error) {
      console.error(`Updating virus definitions failed:\n\n${error}`);
    }
  }

  async fetchDefinitions(): Promise<void> {
    console.log('Fetching virus definitions');

    const { dir, files } = this.scanService.getDefinitionsInfo();

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      await Promise.all(
        files.map((file) => new Promise<void>((resolve, reject) => {
          const writeStream = createWriteStream(`${dir}/${file}`);
          const readStream = this.s3.getObject({ Bucket: DEFINITIONS_BUCKET, Key: file }).createReadStream();

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

  async uploadDefinitions(): Promise<void> {
    const { dir } = this.scanService.getDefinitionsInfo();

    await Promise.all(
      readdirSync(dir)
        .map(
          (file) => this.s3.putObject(
            {
              Bucket: DEFINITIONS_BUCKET, Key: file, Body: readFileSync(`${dir}/${file}`), ACL: 'public-read',
            },
          ).promise(),
        ),
    );
  }

  async tagBucketFile(key: string, bucket: string, status: 'clean' | 'dirty'): Promise<void> {
    await this.s3
      .putObjectTagging({
        Bucket: bucket,
        Key: key,
        Tagging: {
          TagSet: [
            {
              Key: 'av-status',
              Value: status,
            },
          ],
        },
      })
      .promise();
  }

  async fetchBucketFile(key: string, bucket: string): Promise<string> {
    const path = `/tmp/${key}`;
    const s3Object = await this.s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();

    // @ts-ignore
    writeFileSync(path, s3Object.Body);

    return path;
  }

  definitionsAvailable(): boolean {
    const { dir } = this.scanService.getDefinitionsInfo();
    try {
      return existsSync(dir) && readdirSync(dir).length > 0;
    } catch {
      return false;
    }
  }
}
