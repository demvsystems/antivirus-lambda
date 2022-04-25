/* eslint-disable no-console */
import type S3 from 'aws-sdk/clients/s3';
import { unlink, writeFile } from 'fs/promises';
import { readDeep } from 'fspromises-toolbox';

import { IScanService } from './clamAvService';
import { directoryExistsIsNotEmpty, mkdirIfNotExists } from './utils';

const { DEFINITIONS_BUCKET = '' } = process.env;

export interface IVirusScan {
  scan(key: string, bucket: string): Promise<void>
  refreshDefinitions(): Promise<void>
  fetchDefinitions(): Promise<void>
  definitionsAvailable(): Promise<boolean>
}

export class VirusScan implements IVirusScan {
  private scanService: IScanService;

  private s3: S3;

  constructor(scanService: IScanService, s3: S3) {
    this.scanService = scanService;
    this.s3 = s3;
  }

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
      await unlink(filePath);
    }
  }

  async refreshDefinitions(): Promise<void> {
    console.log('Updating virus definitions');

    const { dir } = this.scanService.getDefinitionsInfo();

    await mkdirIfNotExists(dir);

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

    await mkdirIfNotExists(dir);

    try {
      await Promise.all(
        files.map(async (file) => {
          const readFile = await this.s3.getObject({ Bucket: DEFINITIONS_BUCKET, Key: file }).promise();
          return writeFile(`${dir}/${file}`, readFile);
        }),
      );
    } catch (error) {
      console.error(`Fetching virus definitions failed:\n\n${error}`);
      return;
    }

    console.log('Finished fetching virus definitions');
  }

  async uploadDefinitions(): Promise<void> {
    const { dir } = this.scanService.getDefinitionsInfo();

    const files = await readDeep(dir);

    await Promise.all(
      files.map(
        (file) => this.s3.putObject(
          {
            Bucket: DEFINITIONS_BUCKET,
            Key: file.name,
            Body: file.content,
            ACL: 'public-read',
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

    await writeFile(path, s3Object.Body);

    return path;
  }

  async definitionsAvailable(): Promise<boolean> {
    const { dir } = this.scanService.getDefinitionsInfo();
    return directoryExistsIsNotEmpty(dir);
  }
}
