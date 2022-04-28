/* eslint-disable unicorn/prevent-abbreviations */
import { virusScan } from './handler';
import { mockedFn } from './testUtils';
import { VirusScan } from './virusScan';

jest.mock('./virusScan');

describe('handler.virusScan', () => {
  it('logs warmed for warmer event and returns', async () => {
    const log = jest.spyOn(console, 'log');

    const returnValue = await virusScan({ source: 'serverless-plugin-warmup' });

    expect(log).toHaveBeenCalledWith('warmed');
    expect(returnValue).toBeUndefined();
  });

  it('refreshes definitions for updater event', async () => {
    await virusScan({ resources: ['update-virus-definitions-schedule'] });

    expect(mockedFn(VirusScan.prototype.refreshDefinitions)).toHaveBeenCalled();
  });

  it('scans bucket file for a s3 event with an existing s3 Record', async () => {
    const fileToScan = 'fileToScan.txt';
    const bucketName = 'bucket-name';

    await virusScan({
      Records: [{
        s3: {
          object: {
            key: fileToScan,
          },
          bucket: {
            name: bucketName,
          },
        },
      }],
    });

    expect(mockedFn(VirusScan.prototype.scan)).toHaveBeenCalledWith(fileToScan, bucketName);
  });
});
