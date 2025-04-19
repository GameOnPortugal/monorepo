export class InvalidId extends Error {
    constructor (message: string) {
        super(message)
        this.name = 'InvalidId'
    }
}
