import { AbstractStringVo } from './AbstractStringVo';
import { InvalidId } from './InvalidId.ts';

export abstract class Id<T> extends AbstractStringVo<T> {
    public static fromString<T extends Id<T>>(this: new (id: string) => T, id: string): T {
        if (id === undefined || !Id.isValid(id)) {
            throw new InvalidId(`Invalid ${this.name} id`);
        }

        return new this(id);
    }

    public static generate<T extends Id<T>>(this: new (id: string) => T): T {
        // Was uuidv7() from the `uuid` package (M3.4: dropped, single call
        // site). Nothing in the codebase orders by or otherwise relies on
        // the timestamp-sortable property v7 ids have over v4 — ids are
        // always looked up by exact value, and every table orders by its own
        // createdAt/completionDate column rather than by id. crypto.randomUUID()
        // (stdlib, no import needed) produces v4 ids, which is a strictly
        // smaller change than it looks: `isValid` below only checks length.
        return new this(crypto.randomUUID());
    }

    public static isValid(id: string): boolean {
        return id.length === 36;
    }
}
