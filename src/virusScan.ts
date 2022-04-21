import { IClamAVService } from './clamAvService';

export interface IVirusScan {
  scan(filePath: string): Promise<void>
  refreshDefinitions(): Promise<void>
  fetchDefinitions(): Promise<void>
}

export class VirusScan implements IVirusScan {
  private scanService: IClamAVService;

  constructor(scanService: IClamAVService) {
    this.scanService = scanService;
  }

  scan(filePath: string): Promise<void> {}

  refreshDefinitions(): Promise<void> {}

  fetchDefinitions(): Promise<void> {}
}
