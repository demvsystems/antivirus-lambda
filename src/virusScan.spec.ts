/* eslint-disable unicorn/prevent-abbreviations */
import { readdirSync, readFileSync, writeFileSync } from 'fs';

import { VirusScan } from './virusScan';

jest.mock('fs', () => ({
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('VirusScan', () => {
  const getObject = jest.fn().mockReturnThis();
  const putObject = jest.fn().mockReturnThis();
  const putObjectTagging = jest.fn().mockReturnThis();
  const promise = jest.fn();
  // TODO simplify this mock setup
  const createReadStream = jest.fn().mockReturnThis();
  const pipe = jest.fn();
  const on = jest.fn();

  const S3Mock = jest.fn().mockImplementation(() => ({
    getObject,
    putObject,
    putObjectTagging,
    promise,
    // TODO simplify this mock setup
    createReadStream,
    pipe,
    on,
  }));

  const scan = jest.fn();
  const getDefinitionsInfo = jest.fn();
  const updateDefinitions = jest.fn();

  const ClamAvServiceMock = jest.fn().mockImplementation(() => ({
    scan, getDefinitionsInfo, updateDefinitions,
  }));

  let virusScan: VirusScan;
  let fetchBucketFile: jest.SpyInstance;
  let definitionsAvailable: jest.SpyInstance;

  const fileToScan = 'testFile.txt';

  beforeEach(() => {
    virusScan = new VirusScan(new ClamAvServiceMock(), new S3Mock());

    getDefinitionsInfo.mockReturnValue({
      dir: '/tmp/defs',
      files: [],
    });

    fetchBucketFile = jest.spyOn(VirusScan.prototype, 'fetchBucketFile').mockResolvedValue(fileToScan);
    definitionsAvailable = jest.spyOn(VirusScan.prototype, 'definitionsAvailable').mockReturnValue(true);

    // We set all files to clean by default
    scan.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('scan', () => {
    it('fetches file from bucket', async () => {
      await virusScan.scan(fileToScan, 'bucket');

      expect(fetchBucketFile).toHaveBeenCalledWith(fileToScan, 'bucket');
    });

    it('fetches definitions if not available', async () => {
      const fetchDefinitions = jest.spyOn(VirusScan.prototype, 'fetchDefinitions').mockResolvedValue();
      definitionsAvailable.mockReturnValue(false);

      await virusScan.scan(fileToScan, 'bucket');

      expect(fetchDefinitions).toHaveBeenCalled();
    });

    it('scans file', async () => {
      await virusScan.scan(fileToScan, 'bucket');

      expect(scan).toHaveBeenCalledWith(fileToScan);
    });

    it.each([
      { tag: 'clean', cleanStatus: true },
      { tag: 'dirty', cleanStatus: false },
    ])('tags file if scan result is $cleanStatus ($tag)', async ({ tag, cleanStatus }) => {
      const tagBucketFile = jest.spyOn(VirusScan.prototype, 'tagBucketFile').mockResolvedValue();
      scan.mockResolvedValue(cleanStatus);

      await virusScan.scan(fileToScan, 'bucket');

      expect(tagBucketFile).toHaveBeenCalledWith(fileToScan, 'bucket', tag);
    });
  });

  describe('refreshDefinitions', () => {
    let uploadDefinitions: jest.SpyInstance;

    beforeEach(() => {
      uploadDefinitions = jest.spyOn(VirusScan.prototype, 'uploadDefinitions').mockResolvedValue();
    });

    it('updates definitions', async () => {
      await virusScan.refreshDefinitions();

      expect(updateDefinitions).toHaveBeenCalled();
    });

    it('uploads definitions', async () => {
      await virusScan.refreshDefinitions();

      expect(uploadDefinitions).toHaveBeenCalled();
    });
  });

  describe('fetchDefinitions', () => {
    const DEFINITIONS_BUCKET = 'definitions-bucket';
    const origEnv = process.env;
    beforeEach(() => {
      process.env.DEFINITIONS_BUCKET = DEFINITIONS_BUCKET;
    });

    afterEach(() => {
      process.env = origEnv;
    });

    it('fetches definitions from definitions bucket', async () => {
      getDefinitionsInfo.mockReturnValue({
        dir: '/tmp/defs',
        files: ['daily.cvd', 'main.cvd', 'bytecode.cvd'],
      });

      // TODO simplify mock setup for writeStream and readStream
      // For now we only care about the happy path
      on.mockImplementation((event, handler) => {
        if (event === 'end') handler();
        return jest.fn().mockReturnThis();
      });

      await virusScan.fetchDefinitions();

      expect(getObject).toHaveBeenCalledTimes(3);
      // TODO fix setting process.env. At the moment we set it at the top of the module
      // and that prevents us from setting process.env for every test as the assignment
      // takes place directly after importing the module under test
      expect(getObject).toHaveBeenLastCalledWith({ Bucket: expect.any(String), Key: 'bytecode.cvd' });
    });
  });

  describe('uploadDefinitions', () => {
    const mockedReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
    const mockedReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

    it('uploads definitions to definitions bucket', async () => {
      const files = ['daily.cvd', 'main.cvd', 'bytecode.cvd'];

      getDefinitionsInfo.mockReturnValue({
        dir: '/tmp/defs',
        files,
      });

      // @ts-ignore as we cannot convert to Dirent type
      mockedReaddirSync.mockReturnValue(files);
      mockedReadFileSync.mockReturnValue('file-blob');

      await virusScan.uploadDefinitions();

      expect(readFileSync).toHaveBeenLastCalledWith('/tmp/defs/bytecode.cvd');
      expect(putObject).toHaveBeenCalledTimes(3);
      expect(putObject).toHaveBeenLastCalledWith({
        Bucket: expect.any(String), Key: 'bytecode.cvd', Body: 'file-blob', ACL: 'public-read',
      });
    });
  });

  describe('tagBucketFile', () => {
    it.each([
      { status: 'clean' },
      { status: 'dirty' },
    ])('tags bucket file depending on status ($status))', async ({ status }) => {
      await virusScan.tagBucketFile('key', 'bucket', status as 'clean' | 'dirty');

      expect(putObjectTagging).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: 'key',
        Tagging: {
          TagSet: [
            {
              Key: 'av-status',
              Value: status,
            },
          ],
        },
      });
    });
  });

  describe('fetchBucketFile', () => {
    const mockedWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
    const fileContent = 'blob-of-bucket-file';

    beforeEach(() => {
      fetchBucketFile.mockRestore();
      promise.mockResolvedValue({ Body: fileContent });
    });

    it('fetches file from bucket', async () => {
      await virusScan.fetchBucketFile(fileToScan, 'bucket');

      expect(getObject).toHaveBeenCalledWith({
        Bucket: 'bucket',
        Key: fileToScan,
      });
    });

    it('writes fetched file to disk', async () => {
      await virusScan.fetchBucketFile(fileToScan, 'bucket');

      expect(mockedWriteFileSync).toHaveBeenCalledWith(`/tmp/${fileToScan}`, fileContent);
    });

    it('returns path to file', async () => {
      const pathToFile = await virusScan.fetchBucketFile(fileToScan, 'bucket');

      expect(pathToFile).toBe(`/tmp/${fileToScan}`);
    });
  });
});
