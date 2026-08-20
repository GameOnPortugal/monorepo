import { describe, test, expect } from 'bun:test';
import {
    buildCommandsOnlyChannelPlan,
    mergeManagedBits,
    PERMISSION_BIT_SEND_MESSAGES,
    PERMISSION_BIT_USE_APPLICATION_COMMANDS,
    COMMANDS_ONLY_MANAGED_BITS,
} from '../../../../src/Domain/Moderation/ChannelPermissionPlan.ts';

describe('buildCommandsOnlyChannelPlan', () => {
    test('no existing overwrite: denies SendMessages, allows UseApplicationCommands, changed=true', () => {
        const plan = buildCommandsOnlyChannelPlan('111', null);

        expect(plan.desired.deny & PERMISSION_BIT_SEND_MESSAGES).toBe(PERMISSION_BIT_SEND_MESSAGES);
        expect(plan.desired.allow & PERMISSION_BIT_USE_APPLICATION_COMMANDS).toBe(
            PERMISSION_BIT_USE_APPLICATION_COMMANDS,
        );
        expect(plan.desired.allow & PERMISSION_BIT_SEND_MESSAGES).toBe(0n);
        expect(plan.desired.deny & PERMISSION_BIT_USE_APPLICATION_COMMANDS).toBe(0n);
        expect(plan.changed).toBe(true);
    });

    test('an overwrite that already has the desired bits is unchanged', () => {
        const current = {
            allow: PERMISSION_BIT_USE_APPLICATION_COMMANDS,
            deny: PERMISSION_BIT_SEND_MESSAGES,
        };

        const plan = buildCommandsOnlyChannelPlan('111', current);

        expect(plan.changed).toBe(false);
        expect(plan.desired).toEqual(current);
    });

    test('unrelated bits already set on the overwrite are preserved, not wiped', () => {
        // A moderator granted @everyone ManageMessages (bit 13) on this
        // channel for some unrelated reason, and SendMessages happens to
        // already be allowed (the opposite of what we want).
        const manageMessagesBit = 1n << 13n;
        const current = { allow: PERMISSION_BIT_SEND_MESSAGES | manageMessagesBit, deny: 0n };

        const plan = buildCommandsOnlyChannelPlan('111', current);

        // Our two managed bits flipped...
        expect(plan.desired.allow & PERMISSION_BIT_SEND_MESSAGES).toBe(0n);
        expect(plan.desired.deny & PERMISSION_BIT_SEND_MESSAGES).toBe(PERMISSION_BIT_SEND_MESSAGES);
        expect(plan.desired.allow & PERMISSION_BIT_USE_APPLICATION_COMMANDS).toBe(
            PERMISSION_BIT_USE_APPLICATION_COMMANDS,
        );
        // ...but the unrelated ManageMessages grant survives untouched.
        expect(plan.desired.allow & manageMessagesBit).toBe(manageMessagesBit);
        expect(plan.desired.deny & manageMessagesBit).toBe(0n);
        expect(plan.changed).toBe(true);
    });
});

describe('mergeManagedBits', () => {
    test('an empty managed-bits list is a no-op', () => {
        const current = { allow: 123n, deny: 456n };

        expect(mergeManagedBits(current, [])).toEqual(current);
    });

    test('a bit set in both allow and deny (an inconsistent starting state) ends up in exactly one', () => {
        const bit = 1n << 5n;
        const current = { allow: bit, deny: bit };

        const merged = mergeManagedBits(current, [{ bit, grant: true }]);

        expect(merged.allow & bit).toBe(bit);
        expect(merged.deny & bit).toBe(0n);
    });

    test('COMMANDS_ONLY_MANAGED_BITS denies SendMessages and grants UseApplicationCommands', () => {
        expect(COMMANDS_ONLY_MANAGED_BITS).toEqual([
            { bit: PERMISSION_BIT_SEND_MESSAGES, grant: false },
            { bit: PERMISSION_BIT_USE_APPLICATION_COMMANDS, grant: true },
        ]);
    });
});
