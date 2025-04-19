export class NotAuthorized extends Error {
  constructor(userId: string, screenshotId: string) {
    super(`User "${userId}" is not authorized to delete screenshot "${screenshotId}"`);
    this.name = 'NotAuthorized';
  }
}
