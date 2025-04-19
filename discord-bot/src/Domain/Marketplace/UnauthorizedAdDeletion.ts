export class UnauthorizedAdDeletion extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedAdDeletion'
  }
}
