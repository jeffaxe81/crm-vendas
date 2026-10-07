export class BackupError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BackupError";
  }
}
