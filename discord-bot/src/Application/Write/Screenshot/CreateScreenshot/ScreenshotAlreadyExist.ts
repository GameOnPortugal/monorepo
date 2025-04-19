export class ScreenshotAlreadyExist extends Error {
    constructor (message: string) {
        super(message)
        this.name = 'ScreenshotAlreadyExist'
    }
}
