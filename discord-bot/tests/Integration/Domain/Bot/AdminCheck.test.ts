import { describe, test, expect } from 'bun:test';
import { PermissionFlagsBits, PermissionsBitField, type Guild } from 'discord.js';
import {
    isGuildAdmin,
    type AdminCheckableInteraction,
} from '../../../../src/Domain/Bot/AdminCheck';

/**
 * Unit coverage for M1.10: the server-side half of the permission model.
 * `isGuildAdmin` is deliberately typed to accept a `Pick<...>` of an
 * interaction rather than the real `ChatInputCommandInteraction` (see
 * AdminCheck.ts), so this is exercised with plain object literals — no
 * mocking library, matching the rest of this codebase's test fixtures —
 * plus discord.js's own `PermissionsBitField`, which is a real exported
 * value, not a fake.
 */
describe('isGuildAdmin', () => {
    const fakeGuild = {} as Guild;

    test('true for a member with ManageMessages in the guild', () => {
        const interaction: AdminCheckableInteraction = {
            guild: fakeGuild,
            member: {
                permissions: new PermissionsBitField(PermissionFlagsBits.ManageMessages),
            } as AdminCheckableInteraction['member'],
        };

        expect(isGuildAdmin(interaction)).toBe(true);
    });

    test('false for a member without ManageMessages in the guild', () => {
        const interaction: AdminCheckableInteraction = {
            guild: fakeGuild,
            member: {
                permissions: new PermissionsBitField(PermissionFlagsBits.SendMessages),
            } as AdminCheckableInteraction['member'],
        };

        expect(isGuildAdmin(interaction)).toBe(false);
    });

    test('true for the raw HTTP-interaction member shape (permissions as a string bitfield)', () => {
        const interaction: AdminCheckableInteraction = {
            guild: fakeGuild,
            member: {
                permissions: PermissionFlagsBits.ManageMessages.toString(),
            } as AdminCheckableInteraction['member'],
        };

        expect(isGuildAdmin(interaction)).toBe(true);
    });

    test('false when permissions is a string bitfield without ManageMessages', () => {
        const interaction: AdminCheckableInteraction = {
            guild: fakeGuild,
            member: {
                permissions: PermissionFlagsBits.SendMessages.toString(),
            } as AdminCheckableInteraction['member'],
        };

        expect(isGuildAdmin(interaction)).toBe(false);
    });

    test('false — never throws — when guild is null (the DM case)', () => {
        const interaction: AdminCheckableInteraction = {
            guild: null,
            member: {
                permissions: new PermissionsBitField(PermissionFlagsBits.ManageMessages),
            } as AdminCheckableInteraction['member'],
        };

        expect(isGuildAdmin(interaction)).toBe(false);
    });

    test('false — never throws — when member is null', () => {
        const interaction: AdminCheckableInteraction = {
            guild: fakeGuild,
            member: null,
        };

        expect(isGuildAdmin(interaction)).toBe(false);
    });

    test('false — never throws — when both guild and member are null', () => {
        const interaction: AdminCheckableInteraction = {
            guild: null,
            member: null,
        };

        expect(isGuildAdmin(interaction)).toBe(false);
    });
});
