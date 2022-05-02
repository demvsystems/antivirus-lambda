/* eslint-disable unicorn/prevent-abbreviations */
import { ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';

import { ClamAVService } from './clamAvService';
import { mockedFn } from './testUtils';
import { getReturnCode, spawnAsync } from './utils';

jest.mock('./utils', () => {
  const spawnAsyncMock = jest.fn();
  const getReturnCodeMock = jest.fn();

  return {
    spawnAsync: spawnAsyncMock,
    getReturnCode: getReturnCodeMock,
  };
});

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

describe('ClamAvService', () => {
  const mockedGetReturnCode = mockedFn(getReturnCode);
  const mockedSpawnAsync = mockedFn(spawnAsync);
  const mockedExistsSync = mockedFn(existsSync);
  const mockedUnlink = mockedFn(unlink);
  let isClamdRunningMock: jest.SpyInstance<Promise<boolean>>;

  beforeEach(() => {
    isClamdRunningMock = jest.spyOn(ClamAVService, 'isClamdRunning').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('using clamd', () => {
    describe('scan', () => {
      it('uses clamdscan by default', async () => {
        const clamdscan = jest.spyOn(ClamAVService.prototype, 'clamdscan').mockResolvedValue(0);
        isClamdRunningMock.mockResolvedValue(true);

        const scanService = new ClamAVService();

        await scanService.scan('asd');

        expect(clamdscan).toHaveBeenCalledWith('asd');
      });

      it('starts clamd if it is not running', async () => {
        jest.spyOn(ClamAVService.prototype, 'clamdscan').mockResolvedValue(0);
        const startClamdMock = jest.spyOn(ClamAVService.prototype, 'startClamd').mockResolvedValue(42);
        isClamdRunningMock.mockResolvedValue(false);

        const scanService = new ClamAVService();

        await scanService.scan('asd');

        expect(startClamdMock).toHaveBeenCalled();
      });

      it('calls clamdscan binary with correct arguments', async () => {
        mockedGetReturnCode.mockResolvedValue(0);

        const scanService = new ClamAVService();
        await scanService.clamdscan('asd');

        expect(mockedSpawnAsync).toHaveBeenCalledWith('./bin/clamdscan', [
          '--stdout',
          expect.stringContaining('--config-file='),
          'asd',
        ]);
      });
    });

    describe('startClamd', () => {
      it('calls clamd binary with correct arguments', async () => {
        mockedSpawnAsync.mockResolvedValue({ pid: 42 } as ChildProcess);
        mockedGetReturnCode.mockResolvedValue(0);

        const scanService = new ClamAVService();
        await scanService.startClamd();

        expect(mockedSpawnAsync).toHaveBeenCalledWith('./bin/clamd', [
          expect.stringContaining('--config-file='),
        ]);
      });

      it('fails when clamd cannot be spawned', () => {
        mockedSpawnAsync.mockResolvedValue({ pid: undefined } as ChildProcess);
        mockedGetReturnCode.mockResolvedValue(0);

        const scanService = new ClamAVService();

        expect(async () => {
          await scanService.startClamd();
        }).rejects.toThrowError('Could not spawn clamd. pid is undefined');
      });

      it('fails when clamd returns non-zero return code', () => {
        mockedSpawnAsync.mockResolvedValue({ pid: 123 } as ChildProcess);
        mockedGetReturnCode.mockResolvedValue(42);

        const scanService = new ClamAVService();

        expect(async () => {
          await scanService.startClamd();
        })
          .rejects
          .toThrowError('clamd exited with a non-zero return code');
      });

      it('removes previous clamd socket', async () => {
        mockedSpawnAsync.mockResolvedValue({ pid: 42 } as ChildProcess);
        mockedGetReturnCode.mockResolvedValue(0);
        mockedExistsSync.mockReturnValue(true);

        const scanService = new ClamAVService();
        await scanService.startClamd();

        expect(mockedUnlink).toHaveBeenCalled();
      });
    });
  });

  describe('using clamscan', () => {
    describe('scan', () => {
      it('uses clamscan when setting useClamd flag to false', async () => {
        const clamscan = jest.spyOn(ClamAVService.prototype, 'clamscan').mockResolvedValue(0);

        const scanService = new ClamAVService(false);

        await scanService.scan('asd');

        expect(clamscan).toHaveBeenCalledWith('asd');
      });

      it('calls clamscan binary with correct arguments', async () => {
        mockedGetReturnCode.mockResolvedValue(0);

        const scanService = new ClamAVService();
        await scanService.clamscan('asd');

        expect(mockedSpawnAsync).toHaveBeenCalledWith('./bin/clamscan', [
          expect.stringContaining('--database='),
          'asd',
        ]);
      });
    });
  });

  describe('updateDefinitions', () => {
    it('updates virus definitions with freshclam', async () => {
      const freshclam = jest.spyOn(ClamAVService.prototype, 'freshclam').mockResolvedValue(0);

      const scanService = new ClamAVService();
      await scanService.updateDefinitions();

      expect(freshclam).toHaveBeenCalled();
    });

    it('calls freshclam binary with correct arguments', async () => {
      mockedGetReturnCode.mockResolvedValue(0);

      const scanService = new ClamAVService();
      await scanService.updateDefinitions();

      expect(mockedSpawnAsync).toHaveBeenCalledWith('./bin/freshclam', [
        expect.stringContaining('--config-file='),
        expect.stringContaining('--datadir='),
      ], { env: expect.any(Object) });
    });
  });
});
