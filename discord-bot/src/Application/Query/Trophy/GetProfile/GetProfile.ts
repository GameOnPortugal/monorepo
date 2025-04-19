import type Command from "../../../../Domain/Command/Command";

export class GetProfile implements Command {
    constructor(
        public readonly userId: string
    ) {}
}
