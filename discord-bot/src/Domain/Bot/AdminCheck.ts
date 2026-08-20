import {
    PermissionFlagsBits,
    PermissionsBitField,
    type ChatInputCommandInteraction,
} from 'discord.js';

/**
 * M1.10 — server-side authorisation, the enforcement half of the permission
 * model. Keyed off the guild's `ManageMessages` permission rather than a
 * role ID: whoever a guild's own admins have already granted
 * `ManageMessages` to *is* the answer, so there is no bot-side config (a
 * role snowflake) that can drift from reality the way `DiscordChannels.ts`'s
 * hardcoded IDs did (docs/known-issues.md #16).
 *
 * IMPORTANT — this is one half of a two-part model, not the whole thing:
 *  - `setDefaultMemberPermissions()` on a command builder (see the four
 *    `*SlashCommand.ts` files and `DiscordBot.ts`) is a **client-side UI
 *    hint**. It controls whether Discord *shows* the command to a member by
 *    default, but any server owner can override it per-role or per-member in
 *    Discord's own Integrations settings, entirely outside this codebase's
 *    control. Discord does not re-validate it on every invocation.
 *  - `isGuildAdmin()` here is the **server-side check**: it inspects the
 *    permission bits Discord actually sent with the interaction. Anything
 *    that truly must not run without admin rights (e.g. the marketplace
 *    admin override in M5.10, AutoMod actions in M9.1, moderation in M9.3)
 *    MUST call this — or an equivalent guild-permission check — from inside
 *    the handler. Relying on the builder hint alone is not authorisation.
 *
 * This module intentionally does not implement any specific admin action
 * (e.g. bypassing marketplace ad ownership) — see GLOBAL-PLAN M5.10, which
 * owns the subcommand files that will call this.
 */

/**
 * The shape `isGuildAdmin` actually reads off an interaction. `Pick` (rather
 * than the full `ChatInputCommandInteraction`) so this is callable from
 * tests with a plain object literal — no mocking library, matching the rest
 * of this codebase's test fixtures.
 */
export type AdminCheckableInteraction = Pick<ChatInputCommandInteraction, 'guild' | 'member'>;

/**
 * `member.permissions` is `Readonly<PermissionsBitField>` when discord.js
 * hands back a real `GuildMember` (the normal case for this gateway-based
 * bot, since the only intent it requests is `Guilds` and guilds — including
 * their members the bot itself interacted with — are cached), but the wider
 * `ChatInputCommandInteraction` type also allows the raw HTTP-interaction
 * shape (`APIInteractionGuildMember`), where `permissions` is a *string*
 * bitfield straight off the wire. Both are handled here so callers never
 * have to think about which one they got.
 */
function hasManageMessages(member: AdminCheckableInteraction['member']): boolean {
    if (!member) {
        return false;
    }

    const { permissions } = member;
    const bitfield =
        typeof permissions === 'string'
            ? new PermissionsBitField(BigInt(permissions))
            : permissions;

    return bitfield.has(PermissionFlagsBits.ManageMessages);
}

/**
 * True when the invoking member has `ManageMessages` in the guild the
 * interaction was sent from. Safe to call unconditionally: an interaction
 * with no guild (a DM — see M4.3's `setContexts([Guild])`, which stops this
 * from being reachable via DM in the first place, but this function does not
 * rely on that) or no member data resolves to `false`, never throws.
 */
export function isGuildAdmin(interaction: AdminCheckableInteraction): boolean {
    if (!interaction.guild) {
        return false;
    }

    return hasManageMessages(interaction.member);
}
