export class InvalidAdStatus extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidAdStatus';
    }
}
