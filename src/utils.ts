import { isDir, readDeep } from 'fspromises-toolbox';

export async function directoryExistsIsNotEmpty(directoryPath: string): Promise<boolean> {
  const definitionsDirectoryExists = await isDir(directoryPath);
  if (definitionsDirectoryExists) {
    const files = await readDeep(directoryPath);
    return files.length > 0;
  }

  return false;
}
