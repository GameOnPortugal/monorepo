import { inject, injectable } from 'inversify';
import type { SlashCommandHandler } from '../../../../../Domain/Bot/SlashCommandHandler';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    Locale,
    MessageFlags,
    SlashCommandBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import { SellSubcommand } from './SellSubcommand';
import { WantedSubcommand } from './WantedSubcommand';
import { ListAdsSubcommand } from './ListAdsSubcommand';
import { SearchAdsSubcommand } from './SearchAdsSubcommand';
import { DeleteAdSubcommand } from './DeleteAdSubcommand';
import { SoldAdSubcommand } from './SoldAdSubcommand';
import { BumpAdSubcommand } from './BumpAdSubcommand';
import { EditAdSubcommand } from './EditAdSubcommand';

/**
 * M5.4's pt-PT localisation entry, everywhere a `.setDescriptionLocalizations()`
 * call below needs one. Discord's supported locale list
 * (`discord-api-types`' `Locale` enum) has **no `pt-PT`** — only
 * `Locale.PortugueseBR` (`pt-BR`) exists — so this is the closest official
 * key available, not a claim that the copy underneath it is Brazilian
 * Portuguese. The actual strings are written for the pt-PT community this
 * bot serves, same as every other user-facing string in this file and its
 * subcommands; only the locale *tag* Discord will match a pt-BR client
 * against is borrowed.
 */
const PT_LOCALE = Locale.PortugueseBR;

@injectable()
export class MarketplaceSlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(SellSubcommand) private readonly sellSubcommand: SellSubcommand,
        @inject(WantedSubcommand) private readonly wantedSubcommand: WantedSubcommand,
        @inject(ListAdsSubcommand) private readonly listAdsSubcommand: ListAdsSubcommand,
        @inject(SearchAdsSubcommand) private readonly searchAdsSubcommand: SearchAdsSubcommand,
        @inject(DeleteAdSubcommand) private readonly deleteAdSubcommand: DeleteAdSubcommand,
        @inject(SoldAdSubcommand) private readonly soldAdSubcommand: SoldAdSubcommand,
        @inject(BumpAdSubcommand) private readonly bumpAdSubcommand: BumpAdSubcommand,
        @inject(EditAdSubcommand) private readonly editAdSubcommand: EditAdSubcommand,
    ) {}

    public getName(): string {
        return 'marketplace';
    }

    public builder(): SlashCommandSubcommandsOnlyBuilder {
        return (
            new SlashCommandBuilder()
                .setName('marketplace')
                .setDescription('Manage marketplace listings')
                .setDescriptionLocalizations({ [PT_LOCALE]: 'Gere os anúncios do mercado' })
                .setContexts(InteractionContextType.Guild) // M1.10/M4.3 — not invokable in DMs (ListAdsSubcommand builds guild links off this).
                .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
                // Open to every member — every subcommand here is usable by
                // regular members today (sell/list/delete-your-own, plus
                // M5.6's sold/bump/edit — sold has a *per-invocation* admin
                // override inside SoldAdSubcommand/MarkAdSoldHandler via
                // isGuildAdmin(), not a change to who can see this command).
                // Explicit `null` documents that on purpose.
                .setDefaultMemberPermissions(null)
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('sell')
                        .setDescription('Create a new sale listing')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Cria um novo anúncio de venda',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Name of the item')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Nome do artigo' })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('price')
                                .setDescription('Price of the item')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Preço do artigo' })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('state')
                                .setDescription('Condition of the item')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Estado do artigo' })
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name: 'New',
                                        value: 'new',
                                        name_localizations: { [PT_LOCALE]: 'Novo' },
                                    },
                                    {
                                        name: 'Like new',
                                        value: 'like_new',
                                        name_localizations: { [PT_LOCALE]: 'Como novo' },
                                    },
                                    {
                                        name: 'Used - Good condition',
                                        value: 'used_good',
                                        name_localizations: { [PT_LOCALE]: 'Usado - Bom estado' },
                                    },
                                    {
                                        name: 'Used - With marks',
                                        value: 'used_marks',
                                        name_localizations: { [PT_LOCALE]: 'Usado - Com marcas' },
                                    },
                                    {
                                        name: 'Broken',
                                        value: 'broken',
                                        name_localizations: { [PT_LOCALE]: 'Avariado' },
                                    },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('zone')
                                .setDescription('Your location')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'A tua zona' })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('dispatch')
                                .setDescription('Dispatch method')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Forma de envio' })
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name: 'Included',
                                        value: 'included',
                                        name_localizations: { [PT_LOCALE]: 'Incluído' },
                                    },
                                    {
                                        name: 'Not included',
                                        value: 'not_included',
                                        name_localizations: { [PT_LOCALE]: 'Não incluído' },
                                    },
                                    {
                                        name: 'Face to face',
                                        value: 'face_to_face',
                                        name_localizations: { [PT_LOCALE]: 'Entrega em mão' },
                                    },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('warranty')
                                .setDescription('Warranty information')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Informação de garantia',
                                })
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('description')
                                .setDescription('Description of the item')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Descrição do artigo' })
                                .setRequired(false),
                        )
                        // M5.11 — re-hosted to MinIO before the listing is
                        // even posted (AdImageUploader.ts); a marketplace
                        // without photos was defect #10 in plan 01.
                        .addAttachmentOption((option) =>
                            option
                                .setName('image')
                                .setDescription('Photo of the item')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Foto do artigo' })
                                .setRequired(false),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('wanted')
                        .setDescription('Post that you are looking for an item')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Cria um novo anúncio de procura',
                        })
                        // M5.7 — deliberately the same option shape as `sell`
                        // (see WantedSubcommand.ts's doc comment): one flow,
                        // `adType` and copy are the only things that differ.
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Name of the item you are looking for')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Nome do artigo que procuras',
                                })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('price')
                                .setDescription('How much you are willing to pay')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Quanto estás disposto a pagar',
                                })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('state')
                                .setDescription('Condition you would accept')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Estado que aceitas',
                                })
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name: 'New',
                                        value: 'new',
                                        name_localizations: { [PT_LOCALE]: 'Novo' },
                                    },
                                    {
                                        name: 'Like new',
                                        value: 'like_new',
                                        name_localizations: { [PT_LOCALE]: 'Como novo' },
                                    },
                                    {
                                        name: 'Used - Good condition',
                                        value: 'used_good',
                                        name_localizations: { [PT_LOCALE]: 'Usado - Bom estado' },
                                    },
                                    {
                                        name: 'Used - With marks',
                                        value: 'used_marks',
                                        name_localizations: { [PT_LOCALE]: 'Usado - Com marcas' },
                                    },
                                    {
                                        name: 'Broken',
                                        value: 'broken',
                                        name_localizations: { [PT_LOCALE]: 'Avariado' },
                                    },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('zone')
                                .setDescription('Your location')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'A tua zona' })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('dispatch')
                                .setDescription('Dispatch method')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Forma de envio' })
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name: 'Included',
                                        value: 'included',
                                        name_localizations: { [PT_LOCALE]: 'Incluído' },
                                    },
                                    {
                                        name: 'Not included',
                                        value: 'not_included',
                                        name_localizations: { [PT_LOCALE]: 'Não incluído' },
                                    },
                                    {
                                        name: 'Face to face',
                                        value: 'face_to_face',
                                        name_localizations: { [PT_LOCALE]: 'Entrega em mão' },
                                    },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('warranty')
                                .setDescription('Warranty information')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Informação de garantia',
                                })
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('description')
                                .setDescription('Description of what you are looking for')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Descrição do que procuras',
                                })
                                .setRequired(false),
                        )
                        // M5.11 — same reference-photo option as `sell`
                        // (e.g. "looking for exactly this model").
                        .addAttachmentOption((option) =>
                            option
                                .setName('image')
                                .setDescription('Reference photo of what you are looking for')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Foto de referência do que procuras',
                                })
                                .setRequired(false),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription('List marketplace items from a user')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Lista os anúncios de um utilizador',
                        })
                        .addUserOption((option) =>
                            option
                                .setName('user')
                                .setDescription('User to list items from (defaults to yourself)')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Utilizador (por omissão, tu próprio)',
                                })
                                .setRequired(false),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('search')
                        .setDescription('Search active marketplace listings')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Pesquisa anúncios activos do mercado',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('keyword')
                                .setDescription('Word to search for in the name/description')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Palavra a procurar no nome/descrição',
                                })
                                .setRequired(false)
                                .setMaxLength(100),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('zone')
                                .setDescription('Zone to search in')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Zona a procurar' })
                                .setRequired(false)
                                .setMaxLength(60),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('Listing type')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Tipo de anúncio' })
                                .setRequired(false)
                                .addChoices(
                                    {
                                        name: 'For sale',
                                        value: 'sell',
                                        name_localizations: { [PT_LOCALE]: 'À venda' },
                                    },
                                    {
                                        name: 'Wanted',
                                        value: 'wanted',
                                        name_localizations: { [PT_LOCALE]: 'Procura-se' },
                                    },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('condition')
                                .setDescription('Item condition')
                                .setDescriptionLocalizations({ [PT_LOCALE]: 'Estado do artigo' })
                                .setRequired(false)
                                .addChoices(
                                    {
                                        name: 'New',
                                        value: 'new',
                                        name_localizations: { [PT_LOCALE]: 'Novo' },
                                    },
                                    {
                                        name: 'Like new',
                                        value: 'like_new',
                                        name_localizations: { [PT_LOCALE]: 'Como novo' },
                                    },
                                    {
                                        name: 'Used - Good condition',
                                        value: 'used_good',
                                        name_localizations: { [PT_LOCALE]: 'Usado - Bom estado' },
                                    },
                                    {
                                        name: 'Used - With marks',
                                        value: 'used_marks',
                                        name_localizations: { [PT_LOCALE]: 'Usado - Com marcas' },
                                    },
                                    {
                                        name: 'Broken',
                                        value: 'broken',
                                        name_localizations: { [PT_LOCALE]: 'Avariado' },
                                    },
                                ),
                        )
                        .addIntegerOption((option) =>
                            option
                                .setName('max_price')
                                .setDescription('Maximum price, in whole euros')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Preço máximo, em euros',
                                })
                                .setRequired(false)
                                .setMinValue(0),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('delete')
                        .setDescription('Delete one of your marketplace items')
                        .setDescriptionLocalizations({ [PT_LOCALE]: 'Apaga um dos teus anúncios' })
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID of the item to delete')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'ID do anúncio a apagar',
                                })
                                .setRequired(true)
                                // M4.8 — MarketplaceAutocompleteHandler fills
                                // this in from the member's own ads, which is
                                // what retires the positional-index fallback
                                // DeleteAdSubcommand used to carry.
                                .setAutocomplete(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('sold')
                        .setDescription('Mark one of your marketplace items as sold')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Marca um dos teus anúncios como vendido',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID of the item to mark sold')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'ID do anúncio a marcar como vendido',
                                })
                                .setRequired(true)
                                .setAutocomplete(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('bump')
                        .setDescription(
                            'Repost one of your marketplace items to the top of the channel',
                        )
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Renova um dos teus anúncios (uma vez a cada 72h)',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID of the item to bump')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'ID do anúncio a renovar',
                                })
                                .setRequired(true)
                                .setAutocomplete(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('edit')
                        .setDescription(
                            'Edit the price/description of one of your marketplace items',
                        )
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Edita o preço/descrição de um dos teus anúncios',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID of the item to edit')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'ID do anúncio a editar',
                                })
                                .setRequired(true)
                                .setAutocomplete(true),
                        ),
                )
        );
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const subcommand = context.interaction.options.getSubcommand();

        switch (subcommand) {
            case 'sell':
                await this.sellSubcommand.handle(context);
                break;
            case 'wanted':
                await this.wantedSubcommand.handle(context);
                break;
            case 'list':
                await this.listAdsSubcommand.handle(context);
                break;
            case 'search':
                await this.searchAdsSubcommand.handle(context);
                break;
            case 'delete':
                await this.deleteAdSubcommand.handle(context);
                break;
            case 'sold':
                await this.soldAdSubcommand.handle(context);
                break;
            case 'bump':
                await this.bumpAdSubcommand.handle(context);
                break;
            case 'edit':
                await this.editAdSubcommand.handle(context);
                break;
            default:
                this.logger.error('Unknown subcommand', { subcommand });
                await context.interaction.reply({
                    content: 'Comando desconhecido.',
                    flags: MessageFlags.Ephemeral,
                });
        }
    }
}
