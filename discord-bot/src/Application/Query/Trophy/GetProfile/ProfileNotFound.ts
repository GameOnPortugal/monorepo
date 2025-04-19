export class ProfileNotFound extends Error {
    constructor(public readonly userId: string) {
        super(`Trophy profile not found for user ${userId}`);
    }
}
