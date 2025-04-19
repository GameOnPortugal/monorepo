import { AbstractStringVo } from './AbstractStringVo'
import { v7 as uuidv7 } from 'uuid'
import {InvalidId} from "./InvalidId.ts";

export abstract class Id<T> extends AbstractStringVo<T> {
  public static fromString<T extends Id<T>>(this: new (id: string) => T, id: string): T {
    if (id === undefined || !Id.isValid(id)) {
      throw new InvalidId(`Invalid ${this.name} id`)
    }

    return new this(id)
  }

  public static generate<T extends Id<T>>(this: new (id: string) => T): T {
    return new this(uuidv7())
  }

  public static isValid (id: string): boolean {
    return id.length === 36
  }
}
