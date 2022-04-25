/* eslint-disable no-console */
import type { ChildProcess } from 'child_process';
import { unlink } from 'fs/promises';
import { isFile } from 'fspromises-toolbox';
import { createConnection } from 'net';

import { getReturnCode, spawnAsync } from './utils';

const DEFINITION_FILES = [
  'bytecode.cvd',
  'daily.cvd',
  'main.cvd',
];
const DEFINITIONS_DIR = '/tmp/defs';

const FRESHCLAM_CONFIG = 'bin/freshclam.conf';
const CLAMD_CONFIG = 'bin/scan.conf';

const CLAMSCAN_BIN = './bin/clamscan';
const CLAMDSCAN_BIN = './bin/clamdscan';
const FRESHCLAM_BIN = './bin/freshclam';
const CLAMD_BIN = './bin/clamd';

const CLAMD_SOCKET = '/tmp/clamd.sock';

const LD_LIBRARY_PATH = './lib';

export interface IScanService {
  scan(filePath: string): Promise<boolean>
  getDefinitionsInfo(): { dir: string, files: string[] }
  updateDefinitions(): Promise<void>
}

export class ClamAVService implements IScanService {
  private clamdChildProcess: ChildProcess | null = null;

  constructor(
    private useClamd: boolean = true,
    private definitionFiles: string[] = DEFINITION_FILES,
    private definitionsDirectory: string = DEFINITIONS_DIR,
    private freshclamConfig: string = FRESHCLAM_CONFIG,
    private clamdConfig: string = CLAMD_CONFIG,
  ) {}

  async scan(filePath: string): Promise<boolean> {
    const method = this.useClamd ? this.clamdscan : this.clamscan;

    if (this.useClamd && !await ClamAVService.isClamdRunning()) {
      await this.startClamd();
    }

    const returncode = await method.call(this, filePath);
    return returncode === 0;
  }

  async updateDefinitions(): Promise<void> {
    await this.freshclam();
  }

  getDefinitionsInfo(): { dir: string, files: string[] } {
    return {
      dir: this.definitionsDirectory,
      files: this.definitionFiles,
    };
  }

  async clamscan(filePath: string): Promise<number | null> {
    return getReturnCode(await spawnAsync(CLAMSCAN_BIN, [
      `--database=${this.definitionsDirectory}`,
      filePath,
    ]));
  }

  async clamdscan(filePath: string): Promise<number | null> {
    return getReturnCode(await spawnAsync(CLAMDSCAN_BIN, [
      '--stdout',
      `--config-file=${this.clamdConfig}`,
      filePath,
    ]));
  }

  public async freshclam(): Promise<number | null> {
    return getReturnCode(await spawnAsync(
      FRESHCLAM_BIN,
      [
        `--config-file=${this.freshclamConfig}`,
        `--datadir=${this.definitionsDirectory}`,
      ],
      {
        env: {
          LD_LIBRARY_PATH,
        },
      },
    ));
  }

  static async isClamdRunning(): Promise<boolean> {
    const clamdSocketExists = await isFile(CLAMD_SOCKET);
    if (!clamdSocketExists) {
      console.log(`${CLAMD_SOCKET} doesn't exist`);
      return false;
    }

    return new Promise((resolve) => {
      console.log(`${CLAMD_SOCKET} exists. Trying to connect...`);

      const socket = createConnection(
        CLAMD_SOCKET,
        () => console.log(`Connected to ${CLAMD_SOCKET}`),
      );

      socket.setEncoding('utf-8');
      socket.setTimeout(10_000);
      socket.write('PING');

      socket.once('data', (data: string) => {
        try {
          if (data.trim() !== 'PONG') {
            throw new Error('Did not receive PONG');
          }
          resolve(true);
        } catch {
          resolve(false);
        } finally {
          socket.end();
        }
      });
      socket.on('timeout', () => {
        console.log('Connection attempt timed out');
        socket.end();
        resolve(false);
      });
      socket.on('error', (error) => {
        console.error(`Connection resulted in error: ${error}`);
        socket.end();
        resolve(false);
      });
    });
  }

  async startClamd(): Promise<number> {
    if (this.clamdChildProcess !== null) {
      this.clamdChildProcess.kill('SIGTERM');
    }

    try {
      if (await isFile(CLAMD_SOCKET)) {
        await unlink(CLAMD_SOCKET);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }

    console.log('Spawning clamd...');

    this.clamdChildProcess = await spawnAsync(CLAMD_BIN, [`--config-file=${CLAMD_CONFIG}`]);

    if (this.clamdChildProcess.pid === undefined) {
      throw new Error('Could not spawn clamd. pid is undefined');
    }

    console.log(`clamd successfully spawned. PID: ${this.clamdChildProcess.pid}`);

    const returnCode = await getReturnCode(this.clamdChildProcess);

    if (returnCode !== null && returnCode > 0) {
      throw new Error(`clamd exited with a non-zero return code: '${returnCode}'`);
    }

    console.log('clamd returned successfully. Daemon is running');

    return returnCode as number;
  }
}
