export class UnauthorizedAdRenewal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnauthorizedAdRenewal';
    }
}
