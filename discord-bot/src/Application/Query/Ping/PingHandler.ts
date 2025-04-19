import {injectable} from "inversify";
import type {Ping} from "./Ping.ts";
import type CommandHandler from "../../../Domain/Command/CommandHandler.ts";

@injectable()
export class PingHandler implements CommandHandler<Ping> {
    async handle(command: Ping): Promise<boolean> {
        return true;
    }
}
