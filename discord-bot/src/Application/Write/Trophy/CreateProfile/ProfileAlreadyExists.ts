export class ProfileAlreadyExists extends Error {
  constructor(
      public readonly userId: string,
      public readonly psnProfile: string
  ) {
    super(`Profile already exists for user ${userId} or PSN profile ${psnProfile}`);
    this.name = 'ProfileAlreadyExists';
  }
}
