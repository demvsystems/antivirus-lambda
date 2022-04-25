/* eslint-disable no-restricted-syntax */
import type { ChildProcess, SpawnOptions } from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import {
  access,
  lstat,
  mkdir,
  readdir,
  rm,
} from 'fs/promises';
import path from 'path';

export async function directoryExistsIsNotEmpty(directoryPath: string): Promise<boolean> {
  const directoryExists = await isDirectory(directoryPath);
  if (directoryExists) {
    const files = await readDeep(directoryPath);
    return files.length > 0;
  }

  return false;
}

export async function mkdirIfNotExists(directoryPath: string): Promise<void> {
  if (!(await isDirectory(directoryPath))) {
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    // Empty
  }
  return false;
}

/**
 * Check if given path is a valid directory
 *
 * @export
 * @param {string} directoryPath DirectoryPath
 * @returns {Promise<boolean>} true: if path is a directory,
 * false: if path doesn't exist or it isn't a directory
 */
export async function isDirectory(directoryPath: string): Promise<boolean> {
  if (await exists(directoryPath)) {
    const stat = await lstat(directoryPath);
    return stat.isDirectory();
  }
  return false;
}

/**
 * Check if given path is a valid file
 *
 * @export
 * @param {string} filePath FilePath
 * @returns {Promise<boolean>} true: if path is a file,
 * false: if path doesn't exist or it isn't a file
 */
export async function isFile(filePath: string): Promise<boolean> {
  if (await exists(filePath)) {
    const stat = await lstat(filePath);
    return stat.isFile();
  }
  return false;
}

/**
 * Reads directory files deeply
 *
 * @export
 * @param {string} directoryPath DirectoryPath
 * @returns {(Promise<IFileInfo[]>)}
 */
export async function readDeep(directoryPath: string): Promise<string[]> {
  const paths: string[] = [];

  try {
    const dirents = await readdir(directoryPath, { withFileTypes: true });

    for await (const dirent of dirents) {
      const p = path.resolve(directoryPath, dirent.name);
      if (dirent.isDirectory()) {
        for await (const rp of await readDeep(p)) {
          paths.push(rp);
        }
      } else {
        paths.push(p);
      }
    }
  } catch {
    // Empty
  }

  return paths;
}

/**
 *
 * Unlinks given directory structure recursively
 *
 * @export
 * @param {string} dirPath Root directory path that shall be unlinked
 * @returns {Promise<boolean>}
 * true: if the method executed without problems,
 * false: if the method had problems during execution
 */
export async function unlinkDeep(
  directoryPath: string,
): Promise<boolean> {
  // Check if given path is a valid directory
  if (!(await isDirectory(directoryPath))) {
    return false;
  }

  try {
    // Try to remove folder recursively
    await rm(directoryPath, { recursive: true });
  } catch {
    return false;
  }

  return true;
}
