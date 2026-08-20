import { inject, injectable } from 'inversify';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../DependencyInjection/types.ts';
import type Logger from '../../../../Application/Logger/Logger.ts';
import CommandHandlerManager from '../../../CommandHandler/CommandHandlerManager.ts';
import type { ComponentHandler } from '../../../../Domain/Bot/ComponentHandler.ts';
import type {
    ComponentInteractionContext,
    ModalInteractionContext,
} from '../../../../Domain/Bot/InteractionContext.ts';
import { parseCustomId } from '../../../../Domain/Bot/CustomId.ts';
import { safeReply } from '../../../../Domain/Bot/safeReply.ts';
import { GetRank, type RankType } from '../../../../Application/Query/Trophy/GetRank/GetRank.ts';
import {
    RankPresenter,
    RANK_NAMESPACE,
    RANK_PAGE_ACTION,
} from '../SlashCommand/Trophy/RankPresenter.ts';

const RANK_TYPES: ReadonlySet<string> = new Set<RankType>(['monthly', 'creation', 'lifetime']);
const DEFAULT_PAGE_SIZE = 10;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 10;
const NOT_APPLICABLE = '-';

/**
 * Handles the `trophies:page:...` Prev/Next buttons `RankPresenter` builds
 * for `/trophy rank` (M7.6) — the first consumer of the M4.7 component
 * routing infrastructure in the trophies area.
 *
 * The custom ID is the *entire* state a click carries: type, target page,
 * page size, and (for monthly) the resolved month/year. That is what makes
 * pagination survive a bot restart with no store of its own — but exactly
 * because it is client-supplied, every field is decoded defensively and
 * nothing here is trusted to already be in range (see `CustomId.ts`).
 * `GetRankHandler` does the actual clamping against the current data; this
 * handler's job is only to fail closed (an ephemeral "invalid" reply, never
 * a throw or a stale/empty render) on a custom ID that does not decode into
 * something sane, before it ever reaches that query.
 *
 * No ownership check: the message this button lives on is always the
 * ephemeral reply `RankSubcommand` sent, which only the invoking member can
 * even see — Discord itself is the access boundary here, unlike a public
 * message such as a marketplace listing where the click could come from
 * anyone in the channel.
 */
@injectable()
export class TrophyComponentHandler implements ComponentHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(RankPresenter) private readonly presenter: RankPresenter,
    ) {}

    public getNamespace(): string {
        return RANK_NAMESPACE;
    }

    public async handle(
        context: ComponentInteractionContext | ModalInteractionContext,
    ): Promise<void> {
        if (context.kind !== 'component' || !context.interaction.isButton()) {
            // Trophies only ever issues buttons; a modal or select-menu
            // interaction can never legitimately carry this namespace.
            return;
        }

        const { interaction } = context;
        const decoded = this.decode(interaction.customId);

        if (!decoded) {
            this.logger.warn('Malformed trophies pagination custom ID', {
                customId: interaction.customId,
                userId: interaction.user.id,
            });
            await safeReply(interaction, {
                content:
                    '⚠️ Este botão de paginação já não é válido. Corre `/trophy rank` outra vez.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            const result = await this.commandHandlerManager.handle(
                new GetRank(
                    decoded.type,
                    interaction.user.id,
                    decoded.pageSize,
                    decoded.month,
                    decoded.year,
                    decoded.page,
                ),
            );

            if (!('data' in result)) {
                // Cannot happen for a list rank type — GetRankHandler only
                // returns UserPosition for 'user', which this handler never
                // encodes into a button. Guarded rather than asserted so a
                // future change to that contract fails safe here too.
                throw new Error(`GetRank returned a non-paginated result for type ${decoded.type}`);
            }

            const date =
                decoded.type === 'monthly' && decoded.month && decoded.year
                    ? new Date(decoded.year, decoded.month - 1)
                    : undefined;

            const embed = this.presenter.buildRankingEmbed(result, decoded.type, date);
            const row = this.presenter.buildPaginationRow(
                decoded.type,
                result,
                decoded.month,
                decoded.year,
            );

            await interaction.update({ embeds: [embed], components: [row] });
        } catch (error) {
            this.logger.error('Error handling trophies pagination click', {
                error: error instanceof Error ? error.message : 'Unknown error',
                customId: interaction.customId,
                userId: interaction.user.id,
            });

            await safeReply(interaction, {
                content: '⚠️ Ocorreu um erro ao mudar de página. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    /**
     * `trophies:page:<type>:<page>:<pageSize>:<month>:<year>` -> the typed,
     * bounds-safe values `GetRank` needs, or `null` if it does not decode
     * into something that shape (wrong action, wrong arg count, an
     * unrecognised type). Numeric fields fall back to sane defaults rather
     * than propagating `NaN` — the actual range clamp still happens in
     * `GetRankHandler`, this only guarantees well-typed input reaches it.
     */
    private decode(customId: string): {
        type: RankType;
        page: number;
        pageSize: number;
        month?: number;
        year?: number;
    } | null {
        const parsed = parseCustomId(customId);
        if (!parsed || parsed.namespace !== RANK_NAMESPACE || parsed.action !== RANK_PAGE_ACTION) {
            return null;
        }

        if (parsed.args.length !== 5) {
            return null;
        }
        const [typeArg, pageArg, pageSizeArg, monthArg, yearArg] = parsed.args as [
            string,
            string,
            string,
            string,
            string,
        ];
        if (!RANK_TYPES.has(typeArg)) {
            return null;
        }

        const type = typeArg as RankType;
        const page = toPositiveInt(pageArg, 1);
        const pageSize = clamp(
            toPositiveInt(pageSizeArg, DEFAULT_PAGE_SIZE),
            MIN_PAGE_SIZE,
            MAX_PAGE_SIZE,
        );
        const month =
            type === 'monthly' && monthArg !== NOT_APPLICABLE
                ? clampOrUndefined(toPositiveInt(monthArg, 0), 1, 12)
                : undefined;
        const year =
            type === 'monthly' && yearArg !== NOT_APPLICABLE
                ? toPositiveInt(yearArg, 0) || undefined
                : undefined;

        return { type, page, pageSize, month, year };
    }
}

function toPositiveInt(raw: string, fallback: number): number {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function clampOrUndefined(value: number, min: number, max: number): number | undefined {
    return value >= min && value <= max ? value : undefined;
}
