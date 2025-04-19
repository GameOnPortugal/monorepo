import type {Bot} from "../../../Domain/Bot/Bot.ts";
import {injectable} from "inversify";

@injectable()
export class InMemoryClient implements Bot {
    async start(): Promise<void> {
        console.log('InMemoryClient started');
    }
}
