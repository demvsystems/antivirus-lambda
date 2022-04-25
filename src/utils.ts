import type { ChildProcess, SpawnOptions } from 'child_process';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { isDir, readDeep } from 'fspromises-toolbox';

export async function directoryExistsIsNotEmpty(directoryPath: string): Promise<boolean> {
  const directoryExists = await isDir(directoryPath);
  if (directoryExists) {
    const files = await readDeep(directoryPath);
    return files.length > 0;
  }

  return false;
}

export async function mkdirIfNotExists(directoryPath: string): Promise<void> {
  if (!(await isDir(directoryPath))) {
    await mkdir(directoryPath, { recursive: true });
  }
}

export function spawnAsync(
  command: string,
  arguments_: string[] = [],
  options?: SpawnOptions,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      command,
      arguments_,
      { stdio: 'inherit', ...options, env: { ...(options?.env ? options.env : {}), ...process.env } },
    );
    proc.on('error', (error) => reject(error));
    proc.on('spawn', () => resolve(proc));
  });
}

export function getReturnCode(childProcess: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    childProcess.on('close', (code) => resolve(code));
  });
}
