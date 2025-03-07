import type { ChildProcess, SpawnOptions } from 'child_process';
import { spawn } from 'child_process';

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
