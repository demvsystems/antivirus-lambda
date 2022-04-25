import { VirusScan } from './virusScan';

jest.mock('fs', () => ({
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

describe('VirusScan', () => {
  const getObject = jest.fn().mockReturnThis();
  const putObject = jest.fn().mockReturnThis();
  const putObjectTagging = jest.fn().mockReturnThis();
  const promise = jest.fn();

  const S3Mock = jest.fn().mockImplementation(() => ({
    getObject, putObject, putObjectTagging, promise,
  }));

  const scan = jest.fn();
  const getDefinitionsInfo = jest.fn();
  const updateDefinitions = jest.fn();

  const ClamAvServiceMock = jest.fn().mockImplementation(() => ({
    scan, getDefinitionsInfo, updateDefinitions,
  }));

  // const fetchDefinitionsMock = jest.spyOn(VirusScan.prototype, 'fetchDefinitions').mockReturnValue()
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
    it.todo('fetches definitions from definitions bucket');
  });

  describe('uploadDefinitions', () => {
    it.todo('uploads definitions to definitions bucket');
  });

  describe('tagBucketFile', () => {
    it.todo('tags bucket file depending on status');
  });

  describe('fetchBucketFile', () => {
    it.todo('fetches file from bucket');
  });
});
