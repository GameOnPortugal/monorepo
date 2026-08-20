/**
 * Raised when sold/bump/edit (M5.6) is attempted on an ad that is not
 * `active` — already sold, expired or deleted. All three actions only make
 * sense against a listing that is still live; acting on anything else is a
 * stale button (the message was supposed to be removed when the ad left
 * `active`) or a stale autocomplete suggestion, not a legitimate request.
 */
export class AdNotActive extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AdNotActive';
    }
}
