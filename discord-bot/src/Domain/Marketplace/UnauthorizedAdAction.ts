/**
 * Raised when a member who is neither the ad's owner nor (where the action
 * allows it) a guild admin tries to sell/bump/edit an ad (M5.6). Distinct
 * from `UnauthorizedAdDeletion` (M5.2) rather than reused: delete predates
 * the admin-override concept and is owner-only forever (M5.10 is what will
 * eventually add admin override there too), while this one already covers
 * an action — "Marcar vendido" — that an admin *is* allowed to take.
 */
export class UnauthorizedAdAction extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnauthorizedAdAction';
    }
}
