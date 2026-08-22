import { localeOf, type BotLocale, type LocaleCarrier } from './BotLocale';

/**
 * Every string a member reads from an interaction of their own, in both
 * languages the bot speaks.
 *
 * ## What is in here and what is not
 *
 * Only **per-member** copy: an ephemeral reply, a private follow-up, an
 * embed rendered into someone's own `/marketplace list` page, an
 * autocomplete label. Those are seen by exactly one person, whose Discord
 * client language Discord tells us (`interaction.locale`), so they can be
 * answered in that person's language.
 *
 * **Public** copy deliberately stays pt-PT and is *not* routed through here:
 * the posted marketplace listing (`Domain/Marketplace/AdListingRenderer.ts`),
 * the public `/trophy check` profile embed, the screenshot-contest post, the
 * lifecycle DMs and job reports. A message the whole channel reads has no
 * single "the member" to pick a language for, and this is a Portuguese
 * community — cross-cutting rule 1 in `docs/plans/GLOBAL-PLAN.md`. Rendering
 * the same channel in two languages depending on who happened to type the
 * command would be worse than either language alone.
 *
 * ## Adding a string
 *
 * Add it to `pt` first. `BotMessages` is derived from `typeof pt`, and `en`
 * is annotated with it, so TypeScript fails the build until the English
 * translation exists too — there is no way to half-translate a key.
 * Anything with a runtime value is a function, never string concatenation at
 * the call site: word order differs between the two languages and a
 * concatenated sentence cannot be reordered by a translator.
 *
 * Command and subcommand *names* are NOT in here. They stay English and are
 * registered with Discord once (cross-cutting rule 1); their *descriptions*
 * are localised by Discord itself through `setDescriptionLocalizations()` on
 * the builders, not by this module.
 */

/** Marketplace item-condition labels, keyed by the stored `ad.state` value. */
const PT_STATE_LABELS: Record<string, string> = {
    new: '🆕 Novo',
    like_new: '✨ Como novo',
    used_good: '👍 Usado - Bom estado',
    used_marks: '📝 Usado - Com marcas',
    broken: '🔧 Avariado',
};

const EN_STATE_LABELS: Record<string, string> = {
    new: '🆕 New',
    like_new: '✨ Like new',
    used_good: '👍 Used - Good condition',
    used_marks: '📝 Used - With marks',
    broken: '🔧 Broken',
};

/** Marketplace lifecycle labels, keyed by the stored `ad.status` value. */
const PT_STATUS_LABELS: Record<string, string> = {
    active: '🟢 Activo',
    pending_renewal: '🟡 Pendente de renovação',
    sold: '💰 Vendido',
    expired: '⚪ Expirado',
    deleted: '🗑️ Apagado',
};

const EN_STATUS_LABELS: Record<string, string> = {
    active: '🟢 Active',
    pending_renewal: '🟡 Pending renewal',
    sold: '💰 Sold',
    expired: '⚪ Expired',
    deleted: '🗑️ Deleted',
};

const pt = {
    /** Passed to `toLocaleString()` for every number and date this catalogue renders. */
    intlLocale: 'pt-PT',

    common: {
        unknownSubcommand: (subcommand: string) => `Subcomando desconhecido: ${subcommand}`,
        commandError: 'Ocorreu um erro ao processar o comando.',
        executionError: 'Ocorreu um erro ao executar este comando.',
        interactionError: 'Ocorreu um erro ao processar esta acção.',
        staleComponent:
            'Este botão já não está disponível. Corre o comando outra vez para obter uma versão actualizada.',
        paginationError: '⚠️ Ocorreu um erro ao mudar de página. Tenta novamente.',
        previousButton: '◀ Anterior',
        nextButton: 'Próxima ▶',
        unnamed: 'Sem nome',
    },

    marketplace: {
        // --- identifying an ad -------------------------------------------
        invalidAdId:
            'ID de anúncio inválido. Escolhe um anúncio a partir das sugestões em vez de escreveres o ID à mão.',
        invalidAdIdShort: 'ID de anúncio inválido.',
        adNotFound: 'Anúncio não encontrado.',
        adGone: 'Este anúncio já não existe.',
        adNotActive: 'Este anúncio já não está activo.',
        actionUnavailable: 'Esta ação já não está disponível.',

        // --- permissions --------------------------------------------------
        // Kept as verb phrases composed into `noPermissionTo` so the four
        // actions share one sentence; both languages put the verb in the
        // same slot, so no call site ever concatenates around word order.
        actionDelete: 'apagar este anúncio',
        actionBump: 'renovar este anúncio',
        actionMarkSold: 'marcar este anúncio como vendido',
        actionEdit: 'editar este anúncio',
        noPermissionTo: (action: string) => `Não tens permissão para ${action}.`,

        // --- outcomes -----------------------------------------------------
        adDeleted: '🗑️ Anúncio apagado com sucesso.',
        adBumped: '🔄 Anúncio renovado.',
        adSold: '✅ Anúncio marcado como vendido.',
        adUpdated: '✏️ Anúncio actualizado.',
        adPublished: (listingUrl: string) => `✅ O teu anúncio foi publicado: ${listingUrl}`,
        wantedPublished: (listingUrl: string) =>
            `✅ O teu anúncio de procura foi publicado: ${listingUrl}`,

        // --- creating -----------------------------------------------------
        activeAdLimitReached: (limit: number) =>
            `Já tens ${limit} anúncios activos — o limite por membro. Apaga (\`/marketplace delete\`) ou marca um como vendido (\`/marketplace sold\`) antes de criar um novo.`,
        attachmentMustBeImage: 'O ficheiro tem de ser uma imagem.',
        imageUploadFailed: (ref: string) =>
            `Não foi possível processar a imagem. Tenta novamente sem imagem ou com outro ficheiro. (ref: ${ref})`,
        postFailed: (ref: string) =>
            `Não foi possível publicar o teu anúncio. Tenta novamente. (ref: ${ref})`,
        wantedPostFailed: (ref: string) =>
            `Não foi possível publicar o teu anúncio de procura. Tenta novamente. (ref: ${ref})`,
        postedButNotSaved: (ref: string) =>
            `O teu anúncio foi publicado, mas houve um erro ao guardá-lo — pode não aparecer em /marketplace list nem ser possível apagá-lo. Contacta um moderador. (ref: ${ref})`,

        // --- bump rate limit ----------------------------------------------
        bumpRateLimited: (remaining: string) =>
            `Só podes renovar este anúncio uma vez a cada 72 horas. Tenta novamente daqui a ${remaining}.`,

        // --- errors -------------------------------------------------------
        deleteError: (ref: string) =>
            `Ocorreu um erro ao apagar o anúncio. Tenta novamente. (ref: ${ref})`,
        bumpError: (ref: string) =>
            `Ocorreu um erro ao renovar o anúncio. Tenta novamente. (ref: ${ref})`,
        soldError: (ref: string) =>
            `Ocorreu um erro ao marcar o anúncio como vendido. Tenta novamente. (ref: ${ref})`,
        editError: (ref: string) =>
            `Ocorreu um erro ao editar o anúncio. Tenta novamente. (ref: ${ref})`,
        genericError: (ref: string) => `Ocorreu um erro. Tenta novamente. (ref: ${ref})`,
        editModalError: 'Ocorreu um erro ao abrir o formulário de edição. Tenta novamente.',
        listError: 'Ocorreu um erro ao obter os anúncios. Tenta novamente.',
        searchError: 'Ocorreu um erro ao pesquisar anúncios. Tenta novamente.',

        // --- edit modal ---------------------------------------------------
        editModalTitle: 'Editar anúncio',
        editModalPriceLabel: 'Preço',
        editModalDescriptionLabel: 'Descrição',

        // --- contact ------------------------------------------------------
        contactSeller: (profileUrl: string) => `💬 Contacta o vendedor pelo perfil: ${profileUrl}`,

        // --- list / search ------------------------------------------------
        noAdsOfYourOwn: 'Não tens nenhum anúncio activo.',
        noAdsForUser: 'Este utilizador não tem nenhum anúncio activo.',
        adsOfUserTitle: (username: string) => `Anúncios de ${username}`,
        adsFound: (count: number) =>
            `${count} anúncio${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`,
        searchResultsTitle: '🔎 Resultados da pesquisa',
        activeAdsFound: (count: number) =>
            `${count} anúncio${count === 1 ? '' : 's'} activo${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`,
        searchNoResults: 'Não foram encontrados anúncios com esses critérios.',
        searchExpired: '⚠️ Esta pesquisa expirou. Corre `/marketplace search` outra vez.',
        listPaginationExpired:
            '⚠️ Este botão de paginação já não é válido. Corre `/marketplace list` outra vez.',

        // --- list/search embed fields --------------------------------------
        stateLabels: PT_STATE_LABELS,
        statusLabels: PT_STATUS_LABELS,
        typeWanted: '🔍 Procura-se',
        typeSell: '🏷️ Venda',
        viewListing: 'Ver anúncio',
        noLinkedPost: '🔗 Sem publicação associada',
        priceLine: (price: string) => `💰 Preço: ${price}`,
        zoneLine: (zone: string) => `📍 Zona: ${zone}`,
        sellerLine: (authorId: string) => `Vendedor: <@${authorId}>`,
        descriptionLine: (description: string) => `📝 ${description}`,
        pageFooter: (page: number, totalPages: number, totalCount: number) =>
            `Página ${page} de ${totalPages} • ${totalCount} anúncio${totalCount === 1 ? '' : 's'}`,
    },

    screenshot: {
        missingInformation: 'Erro: falta informação obrigatória para a screenshot.',
        attachmentMustBeImage: 'Erro: o anexo tem de ser uma imagem.',
        submitFailed: (ref: string) =>
            `Ocorreu um erro ao submeter a tua screenshot. Tenta novamente. (ref: ${ref})`,
        alreadySubmitted: '⚠️ Erro: esta screenshot já foi submetida.',
        postedButNotSaved: (ref: string) =>
            `A tua screenshot foi publicada, mas houve um erro ao guardá-la — pode não contar para o concurso. Contacta um moderador. (ref: ${ref})`,
        deleted: (id: string) => `✅ A screenshot #${id} foi apagada com sucesso.`,
        invalidId: '⚠️ Erro: formato de ID de screenshot inválido.',
        notFound: (id: string) => `⚠️ Erro: não foi encontrada nenhuma screenshot com o ID #${id}.`,
        notAuthorized: '⛔ Erro: não tens permissão para apagar esta screenshot.',
        deleteError: 'Ocorreu um erro ao apagar a screenshot. Tenta novamente mais tarde.',
        listError: 'Ocorreu um erro ao obter as screenshots. Tenta novamente mais tarde.',
        commandError: 'Ocorreu um erro ao processar o comando de screenshots. Tenta novamente.',
        unknownSubcommand:
            'Subcomando desconhecido. Usa `/screenshot create`, `/screenshot list` ou `/screenshot delete`.',

        noneOfYourOwn:
            '🔍 **As tuas screenshots**\n\nAinda não submeteste nenhuma screenshot. Usa `/screenshot create` para submeteres uma!',
        noneForUser: (username: string) =>
            `🔍 **Screenshots de ${username}**\n\nEste utilizador ainda não submeteu nenhuma screenshot.`,
        yourScreenshotsTitle: '🔍 As tuas screenshots',
        userScreenshotsTitle: (username: string) => `🔍 Screenshots de ${username}`,
        yourScreenshotsCount: (count: number) =>
            `Submeteste ${count} screenshot${count === 1 ? '' : 's'}.`,
        userScreenshotsCount: (username: string, count: number) =>
            `${username} submeteu ${count} screenshot${count === 1 ? '' : 's'}.`,
        unnamed: 'Sem nome',
        unknownPlatform: 'Desconhecida',
        entryLine: (id: string, platform: string, submittedAt: string) =>
            `ID: ${id}\nPlataforma: ${platform}\nSubmetida: ${submittedAt}`,
        listFooter: (shown: number, total: number) => `A mostrar ${shown} de ${total} screenshots.`,
    },

    trophy: {
        profileNotFoundOwn:
            '❌ Ainda não registaste o teu perfil PSN. Usa `/trophy create` para o registar.',
        profileNotFoundOther: '❌ Este utilizador ainda não registou o perfil PSN.',
        profileFetchError: '⚠️ Ocorreu um erro ao obter o perfil PSN.',

        invalidPsnUrl:
            'URL do PSNProfiles inválido. Indica um URL de perfil válido ' +
            '(ex: https://psnprofiles.com/username) ou de um troféu ' +
            '(ex: https://psnprofiles.com/trophies/123-jogo/username).',
        profileRegistered: (psnProfile: string) =>
            `Perfil PSN registado com sucesso: ${psnProfile}`,
        profileAlreadyYours: 'Já tens este perfil PSN registado.',
        profileTakenByOther:
            'Este perfil PSN já foi registado por outra pessoa. Se achas que isto é ' +
            'um erro, contacta um administrador.',
        createError: 'Ocorreu um erro ao registar o teu perfil PSN.',

        rankError: '⚠️ Ocorreu um erro ao obter o ranking de troféus. Tenta novamente mais tarde.',
        rankPaginationExpired:
            '⚠️ Este botão de paginação já não é válido. Corre `/trophy rank` outra vez.',

        // --- rank embeds ---------------------------------------------------
        monthlyRankTitle: '📅 Ranking Mensal de Troféus',
        creationRankTitle: '🎮 Ranking de Troféus Desde Sempre',
        lifetimeRankTitle: '🏆 Ranking Vitalício de Troféus',
        userRankTitle: '📊 Ranking de Troféus',
        genericRankTitle: 'Ranking de Troféus',
        noTrophiesForPeriod: 'Sem troféus registados para este período.',
        pointsAndTrophies: (points: string, trophies: string) =>
            `Pontos: ${points} | Troféus: ${trophies}`,
        rankFooter: (page: number, totalPages: number, totalCount: string) =>
            `Página ${page} de ${totalPages} • ${totalCount} jogador(es) no ranking`,
        userRankingTitle: (username: string) => `📊 Ranking de ${username}`,
        monthlyRankField: '📅 Rank Mensal',
        creationRankField: '🎮 Desde Sempre',
        lifetimeRankField: '🏆 Vitalício',
        totalsField: '📊 Totais',
        noTrophiesThisMonth: 'Sem troféus este mês',
        noTrophiesRecorded: 'Sem troféus registados',
        positionLine: (emoji: string, position: number, points: string, trophies: string) =>
            `${emoji} #${position}\nPontos: ${points}\nTroféus: ${trophies}`,
        totalsLine: (points: string, trophies: string) =>
            `Pontos totais: ${points}\nTroféus totais: ${trophies}`,
        rankFooterLabel: 'Ranking de Troféus',
    },

    privacy: {
        confirmationRequired: (phrase: string) =>
            `⚠️ Para confirmares, escreve exatamente \`${phrase}\` na opção ` +
            '`confirmar`. Esta ação apaga permanentemente os teus anúncios, screenshots ' +
            'e perfil de troféus — não pode ser desfeita.',
        dataDeleted: (ads: number, screenshots: number, trophyProfile: string) =>
            '🗑️ Os teus dados foram apagados permanentemente: ' +
            `${ads} anúncio(s), ${screenshots} screenshot(s)${trophyProfile}` +
            ' Se voltares a usar o bot, o teu histórico começa do zero.',
        trophyProfileAlsoDeleted: (trophies: number) =>
            ` e o teu perfil de troféus (${trophies} troféu(s)).`,
        nothingElseDeleted: '.',
        deleteError:
            'Ocorreu um erro ao apagar os teus dados. Tenta novamente ou contacta um moderador.',
        optedIn:
            '✅ Voltaste a aparecer publicamente no portal — os teus anúncios, ' +
            'screenshots e perfil de troféus voltam a ser visíveis em ' +
            'game-on-portugal.pt.',
        optedOut:
            '✅ Deixaste de aparecer publicamente no portal — os teus anúncios, ' +
            'screenshots e perfil de troféus deixam de ser visíveis em ' +
            'game-on-portugal.pt. Continuas a poder usar o bot normalmente no ' +
            'servidor. Podes voltar a aparecer a qualquer momento com `/privacy opt-in`.',
        error: 'Ocorreu um erro ao processar o teu pedido. Tenta novamente.',
    },
};

/**
 * The shape every catalogue must have, derived from the Portuguese one so
 * pt-PT stays the source of truth for what copy exists at all — English is a
 * translation of it, never the other way round.
 */
export type BotMessages = typeof pt;

const en: BotMessages = {
    intlLocale: 'en-GB',

    common: {
        unknownSubcommand: (subcommand: string) => `Unknown subcommand: ${subcommand}`,
        commandError: 'Something went wrong processing the command.',
        executionError: 'Something went wrong running this command.',
        interactionError: 'Something went wrong processing this action.',
        staleComponent:
            'This button is no longer available. Run the command again to get an up-to-date version.',
        paginationError: '⚠️ Something went wrong changing page. Please try again.',
        previousButton: '◀ Previous',
        nextButton: 'Next ▶',
        unnamed: 'Unnamed',
    },

    marketplace: {
        invalidAdId:
            'Invalid listing ID. Pick a listing from the suggestions instead of typing the ID by hand.',
        invalidAdIdShort: 'Invalid listing ID.',
        adNotFound: 'Listing not found.',
        adGone: 'This listing no longer exists.',
        adNotActive: 'This listing is no longer active.',
        actionUnavailable: 'This action is no longer available.',

        actionDelete: 'delete this listing',
        actionBump: 'bump this listing',
        actionMarkSold: 'mark this listing as sold',
        actionEdit: 'edit this listing',
        noPermissionTo: (action: string) => `You do not have permission to ${action}.`,

        adDeleted: '🗑️ Listing deleted.',
        adBumped: '🔄 Listing bumped.',
        adSold: '✅ Listing marked as sold.',
        adUpdated: '✏️ Listing updated.',
        adPublished: (listingUrl: string) => `✅ Your listing has been posted: ${listingUrl}`,
        wantedPublished: (listingUrl: string) =>
            `✅ Your wanted listing has been posted: ${listingUrl}`,

        activeAdLimitReached: (limit: number) =>
            `You already have ${limit} active listings — the per-member limit. Delete one (\`/marketplace delete\`) or mark one as sold (\`/marketplace sold\`) before creating a new one.`,
        attachmentMustBeImage: 'The file must be an image.',
        imageUploadFailed: (ref: string) =>
            `Your photo could not be processed. Try again without a photo, or with a different file. (ref: ${ref})`,
        postFailed: (ref: string) =>
            `Your listing could not be posted. Please try again. (ref: ${ref})`,
        wantedPostFailed: (ref: string) =>
            `Your wanted listing could not be posted. Please try again. (ref: ${ref})`,
        postedButNotSaved: (ref: string) =>
            `Your listing was posted, but something went wrong saving it — it may not show up in /marketplace list, and you may not be able to delete it. Please contact a moderator. (ref: ${ref})`,

        bumpRateLimited: (remaining: string) =>
            `You can only bump this listing once every 72 hours. Try again in ${remaining}.`,

        deleteError: (ref: string) =>
            `Something went wrong deleting the listing. Please try again. (ref: ${ref})`,
        bumpError: (ref: string) =>
            `Something went wrong bumping the listing. Please try again. (ref: ${ref})`,
        soldError: (ref: string) =>
            `Something went wrong marking the listing as sold. Please try again. (ref: ${ref})`,
        editError: (ref: string) =>
            `Something went wrong editing the listing. Please try again. (ref: ${ref})`,
        genericError: (ref: string) => `Something went wrong. Please try again. (ref: ${ref})`,
        editModalError: 'Something went wrong opening the edit form. Please try again.',
        listError: 'Something went wrong loading the listings. Please try again.',
        searchError: 'Something went wrong searching listings. Please try again.',

        editModalTitle: 'Edit listing',
        editModalPriceLabel: 'Price',
        editModalDescriptionLabel: 'Description',

        contactSeller: (profileUrl: string) =>
            `💬 Contact the seller through their profile: ${profileUrl}`,

        noAdsOfYourOwn: 'You have no active listings.',
        noAdsForUser: 'This member has no active listings.',
        adsOfUserTitle: (username: string) => `${username}'s listings`,
        adsFound: (count: number) => `${count} listing${count === 1 ? '' : 's'} found`,
        searchResultsTitle: '🔎 Search results',
        activeAdsFound: (count: number) => `${count} active listing${count === 1 ? '' : 's'} found`,
        searchNoResults: 'No listings matched those criteria.',
        searchExpired: '⚠️ This search has expired. Run `/marketplace search` again.',
        listPaginationExpired:
            '⚠️ This pagination button is no longer valid. Run `/marketplace list` again.',

        stateLabels: EN_STATE_LABELS,
        statusLabels: EN_STATUS_LABELS,
        typeWanted: '🔍 Wanted',
        typeSell: '🏷️ For sale',
        viewListing: 'View listing',
        noLinkedPost: '🔗 No linked post',
        priceLine: (price: string) => `💰 Price: ${price}`,
        zoneLine: (zone: string) => `📍 Location: ${zone}`,
        sellerLine: (authorId: string) => `Seller: <@${authorId}>`,
        descriptionLine: (description: string) => `📝 ${description}`,
        pageFooter: (page: number, totalPages: number, totalCount: number) =>
            `Page ${page} of ${totalPages} • ${totalCount} listing${totalCount === 1 ? '' : 's'}`,
    },

    screenshot: {
        missingInformation: 'Error: missing required information for the screenshot.',
        attachmentMustBeImage: 'Error: the attachment must be an image.',
        submitFailed: (ref: string) =>
            `Something went wrong submitting your screenshot. Please try again. (ref: ${ref})`,
        alreadySubmitted: '⚠️ Error: this screenshot has already been submitted.',
        postedButNotSaved: (ref: string) =>
            `Your screenshot was posted, but something went wrong saving it — it may not count for the contest. Please contact a moderator. (ref: ${ref})`,
        deleted: (id: string) => `✅ Screenshot #${id} has been deleted.`,
        invalidId: '⚠️ Error: invalid screenshot ID format.',
        notFound: (id: string) => `⚠️ Error: no screenshot found with ID #${id}.`,
        notAuthorized: '⛔ Error: you are not allowed to delete this screenshot.',
        deleteError: 'Something went wrong deleting the screenshot. Please try again later.',
        listError: 'Something went wrong loading the screenshots. Please try again later.',
        commandError: 'Something went wrong processing your screenshot command. Please try again.',
        unknownSubcommand:
            'Unknown subcommand. Use `/screenshot create`, `/screenshot list` or `/screenshot delete`.',

        noneOfYourOwn:
            "🔍 **Your screenshots**\n\nYou haven't submitted any screenshots yet. Use `/screenshot create` to submit one!",
        noneForUser: (username: string) =>
            `🔍 **${username}'s screenshots**\n\nThis member hasn't submitted any screenshots yet.`,
        yourScreenshotsTitle: '🔍 Your screenshots',
        userScreenshotsTitle: (username: string) => `🔍 ${username}'s screenshots`,
        yourScreenshotsCount: (count: number) =>
            `You have submitted ${count} screenshot${count === 1 ? '' : 's'}.`,
        userScreenshotsCount: (username: string, count: number) =>
            `${username} has submitted ${count} screenshot${count === 1 ? '' : 's'}.`,
        unnamed: 'Unnamed',
        unknownPlatform: 'Unknown',
        entryLine: (id: string, platform: string, submittedAt: string) =>
            `ID: ${id}\nPlatform: ${platform}\nSubmitted: ${submittedAt}`,
        listFooter: (shown: number, total: number) => `Showing ${shown} of ${total} screenshots.`,
    },

    trophy: {
        profileNotFoundOwn:
            "❌ You haven't registered your PSN profile yet. Use `/trophy create` to register it.",
        profileNotFoundOther: "❌ This member hasn't registered a PSN profile yet.",
        profileFetchError: '⚠️ Something went wrong loading the PSN profile.',

        invalidPsnUrl:
            'Invalid PSNProfiles URL. Give a valid profile URL ' +
            '(e.g. https://psnprofiles.com/username) or trophy URL ' +
            '(e.g. https://psnprofiles.com/trophies/123-game/username).',
        profileRegistered: (psnProfile: string) =>
            `PSN profile registered successfully: ${psnProfile}`,
        profileAlreadyYours: 'You already have this PSN profile registered.',
        profileTakenByOther:
            'This PSN profile has already been registered by someone else. If you think this ' +
            'is a mistake, contact an administrator.',
        createError: 'Something went wrong registering your PSN profile.',

        rankError: '⚠️ Something went wrong loading the trophy ranking. Please try again later.',
        rankPaginationExpired:
            '⚠️ This pagination button is no longer valid. Run `/trophy rank` again.',

        monthlyRankTitle: '📅 Monthly Trophy Ranking',
        creationRankTitle: '🎮 All-Time Trophy Ranking',
        lifetimeRankTitle: '🏆 Lifetime Trophy Ranking',
        userRankTitle: '📊 Trophy Ranking',
        genericRankTitle: 'Trophy Ranking',
        noTrophiesForPeriod: 'No trophies recorded for this period.',
        pointsAndTrophies: (points: string, trophies: string) =>
            `Points: ${points} | Trophies: ${trophies}`,
        rankFooter: (page: number, totalPages: number, totalCount: string) =>
            `Page ${page} of ${totalPages} • ${totalCount} player(s) in the ranking`,
        userRankingTitle: (username: string) => `📊 ${username}'s ranking`,
        monthlyRankField: '📅 Monthly rank',
        creationRankField: '🎮 All-time',
        lifetimeRankField: '🏆 Lifetime',
        totalsField: '📊 Totals',
        noTrophiesThisMonth: 'No trophies this month',
        noTrophiesRecorded: 'No trophies recorded',
        positionLine: (emoji: string, position: number, points: string, trophies: string) =>
            `${emoji} #${position}\nPoints: ${points}\nTrophies: ${trophies}`,
        totalsLine: (points: string, trophies: string) =>
            `Total points: ${points}\nTotal trophies: ${trophies}`,
        rankFooterLabel: 'Trophy Ranking',
    },

    privacy: {
        confirmationRequired: (phrase: string) =>
            `⚠️ To confirm, type exactly \`${phrase}\` in the \`confirmar\` ` +
            'option. This permanently deletes your listings, screenshots and trophy ' +
            'profile — it cannot be undone.',
        dataDeleted: (ads: number, screenshots: number, trophyProfile: string) =>
            '🗑️ Your data has been permanently deleted: ' +
            `${ads} listing(s), ${screenshots} screenshot(s)${trophyProfile}` +
            ' If you use the bot again, your history starts from scratch.',
        trophyProfileAlsoDeleted: (trophies: number) =>
            ` and your trophy profile (${trophies} trophy/trophies).`,
        nothingElseDeleted: '.',
        deleteError:
            'Something went wrong deleting your data. Please try again or contact a moderator.',
        optedIn:
            '✅ You are publicly visible on the portal again — your listings, ' +
            'screenshots and trophy profile are visible on game-on-portugal.pt once more.',
        optedOut:
            '✅ You no longer appear publicly on the portal — your listings, ' +
            'screenshots and trophy profile are hidden from game-on-portugal.pt. ' +
            'You can keep using the bot normally in the server. You can become visible ' +
            'again at any time with `/privacy opt-in`.',
        error: 'Something went wrong processing your request. Please try again.',
    },
};

const CATALOGUES: Record<BotLocale, BotMessages> = { pt, en };

/** The catalogue for an already-resolved locale. */
export function messages(locale: BotLocale): BotMessages {
    return CATALOGUES[locale];
}

/**
 * The catalogue for whoever triggered an interaction — the call every
 * subcommand, component handler and autocomplete handler makes. Safe on
 * anything without a `locale` (a test fixture, a non-interaction caller):
 * that resolves to pt-PT, the community default. See `BotLocale.ts`.
 */
export function messagesFor(carrier: LocaleCarrier | null | undefined): BotMessages {
    return messages(localeOf(carrier));
}
