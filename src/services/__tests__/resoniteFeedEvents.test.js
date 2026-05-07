import { describe, expect, test, vi } from 'vitest';

import { buildResonitePresenceFeedUpdate } from '../resoniteFeedEvents';

/**
 * @param {{
 *   id?: string,
 *   name?: string,
 *   state?: string,
 *   status?: string,
 *   statusDescription?: string,
 *   location?: string,
 *   traveling?: string,
 *   accessLevel?: string,
 *   broadcastKey?: string,
 *   sessionId?: string,
 *   locationAt?: number,
 *   onlineFor?: number | string,
 *   offlineFor?: number | string,
 *   previousLocation?: string
 * }} [options]
 */
function makeFriend({
    id = 'resonite:u-1',
    name = 'ResoniteUser',
    state = 'online',
    status = 'active',
    statusDescription = 'Online on version 2026.4.21',
    location = 'The Navy Seal',
    traveling = 'The Navy Seal',
    accessLevel = '',
    currentSessionHash = '',
    broadcastKey = '',
    sessionId = '',
    locationAt = 1_000,
    onlineFor = 1_000,
    offlineFor = '',
    previousLocation = ''
} = {}) {
    return {
        id,
        name,
        state,
        provider: 'resonite',
        isExternal: true,
        ref: {
            id,
            displayName: name,
            state,
            status,
            statusDescription,
            location,
            traveling,
            $location_at: locationAt,
            $online_for: onlineFor,
            $offline_for: offlineFor,
            $active_for: '',
            $travelingToTime: locationAt,
            $previousLocation: previousLocation,
            resonite: {
                accessLevel,
                locationName: traveling,
                currentSessionName: traveling,
                currentSessionHash,
                broadcastKey,
                sessionId
            }
        },
        resonite: {
            accessLevel,
            locationName: traveling,
            currentSessionName: traveling,
            currentSessionHash,
            broadcastKey,
            sessionId
        }
    };
}

describe('buildResonitePresenceFeedUpdate', () => {
    test('does not emit feed entries for first snapshot', () => {
        const nextFriend = makeFriend();

        const result = buildResonitePresenceFeedUpdate(null, nextFriend, {
            now: () => 5_000,
            nowIso: () => '2026-04-21T00:00:05.000Z'
        });

        expect(result.feedEntries).toEqual([]);
        expect(result.refPatch.$location_at).toBe(5_000);
        expect(result.refPatch.$online_for).toBe(5_000);
    });

    test('emits online event when a friend comes online', () => {
        const previousFriend = makeFriend({
            state: 'offline',
            status: 'busy',
            statusDescription: '',
            location: 'offline',
            traveling: '',
            onlineFor: '',
            offlineFor: 900
        });
        const nextFriend = makeFriend();

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 5_000,
                nowIso: () => '2026-04-21T00:00:05.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'Online',
            userId: 'resonite:u-1',
            displayName: 'ResoniteUser',
            location: 'The Navy Seal',
            worldName: 'The Navy Seal'
        });
        expect(result.refPatch.$online_for).toBe(5_000);
        expect(result.refPatch.$offline_for).toBe('');
    });

    test('emits gps event when online world changes', () => {
        const previousFriend = makeFriend({
            location: 'Old World',
            traveling: 'Old World',
            locationAt: 2_000
        });
        const nextFriend = makeFriend({
            location: 'New World',
            traveling: 'New World',
            locationAt: 2_000
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 7_000,
                nowIso: () => '2026-04-21T00:00:07.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'GPS',
            location: 'New World',
            worldName: 'New World',
            previousLocation: 'Old World',
            time: 5_000
        });
        expect(result.refPatch.$location_at).toBe(7_000);
    });

    test('appends access level suffix to resonite feed world names', () => {
        const previousFriend = makeFriend({
            location: 'Old World',
            traveling: 'Old World',
            accessLevel: 'contactsplus',
            locationAt: 2_000
        });
        const nextFriend = makeFriend({
            location: 'New World',
            traveling: 'New World',
            accessLevel: 'anyone',
            locationAt: 2_000
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 7_000,
                nowIso: () => '2026-04-21T00:00:07.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'GPS',
            location: 'New World - Public',
            worldName: 'New World - Public',
            previousLocation: 'Old World - Contacts+'
        });
    });

    test('does not emit gps when only the access suffix changes for the same session hash', () => {
        const previousFriend = makeFriend({
            location: 'Soft Sea of Stars',
            traveling: 'Soft Sea of Stars',
            accessLevel: '',
            currentSessionHash: 'S-soft-sea',
            locationAt: 2_000
        });
        const nextFriend = makeFriend({
            location: 'Soft Sea of Stars',
            traveling: 'Soft Sea of Stars',
            accessLevel: 'contactsplus',
            currentSessionHash: 'S-soft-sea',
            locationAt: 2_000
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 7_000,
                nowIso: () => '2026-04-21T00:00:07.000Z'
            }
        );

        expect(result.feedEntries).toEqual([]);
        expect(result.refPatch.$location_at).toBe(2_000);
    });

    test('logs and suppresses gps when the location label changes inside the same session hash', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
            // no-op
        });
        const previousFriend = makeFriend({
            location: 'Private',
            traveling: 'Private',
            currentSessionHash: 'S-shared',
            locationAt: 2_000
        });
        const nextFriend = makeFriend({
            location: 'Shared Session',
            traveling: 'Shared Session',
            currentSessionHash: 'S-shared',
            locationAt: 2_000
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 7_000,
                nowIso: () => '2026-04-21T00:00:07.000Z'
            }
        );

        expect(result.feedEntries).toEqual([]);
        expect(debugSpy).toHaveBeenCalledWith(
            '[ResoniteIntegration] Evaluating GPS emission:',
            expect.stringContaining('"suppressReason": "same-session-identity"')
        );

        debugSpy.mockRestore();
    });

    test('emits gps when the session identity changes even if a stale session hash is reused', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
            // no-op
        });
        const previousFriend = makeFriend({
            location: 'Private',
            traveling: 'Private',
            currentSessionHash: 'S-shared',
            broadcastKey: 'U-water:private-room',
            locationAt: 2_000
        });
        const nextFriend = makeFriend({
            location: 'messing around',
            traveling: 'messing around',
            currentSessionHash: 'S-shared',
            broadcastKey: 'U-water:messing-around',
            locationAt: 2_000
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 7_000,
                nowIso: () => '2026-04-21T00:00:07.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'GPS',
            location: 'messing around',
            previousLocation: 'private',
            time: 5_000
        });
        expect(debugSpy).toHaveBeenCalledWith(
            '[ResoniteIntegration] Evaluating GPS emission:',
            expect.not.stringContaining('same-session-identity')
        );

        debugSpy.mockRestore();
    });

    test('emits gps when an already-online contact resolves a blank location to a world label', () => {
        const previousFriend = makeFriend({
            location: '',
            traveling: '',
            locationAt: 2_000,
            previousLocation: ''
        });
        const nextFriend = makeFriend({
            location: 'New World',
            traveling: 'New World',
            locationAt: 2_000,
            previousLocation: ''
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 5_000,
                nowIso: () => '2026-04-21T00:00:05.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'GPS',
            location: 'New World',
            worldName: 'New World',
            previousLocation: '',
            time: 3_000
        });
        expect(result.refPatch.$previousLocation).toBe('');
        expect(result.refPatch.$location_at).toBe(5_000);
    });

    test('emits gps event after a sparse blank location update', () => {
        const previousFriend = makeFriend({
            location: 'Old World',
            traveling: 'Old World',
            locationAt: 2_000
        });
        const sparseFriend = makeFriend({
            location: '',
            traveling: '',
            locationAt: 2_000
        });
        sparseFriend.ref.$previousLocation = '';

        const sparseResult = buildResonitePresenceFeedUpdate(
            previousFriend,
            sparseFriend,
            {
                now: () => 4_000,
                nowIso: () => '2026-04-21T00:00:04.000Z'
            }
        );

        expect(sparseResult.feedEntries).toEqual([]);
        expect(sparseResult.refPatch.$previousLocation).toBe('Old World');

        sparseFriend.ref.$previousLocation =
            sparseResult.refPatch.$previousLocation;
        sparseFriend.ref.$location_at = sparseResult.refPatch.$location_at;

        const nextFriend = makeFriend({
            location: 'New World',
            traveling: 'New World',
            locationAt: 2_000,
            previousLocation: sparseResult.refPatch.$previousLocation
        });

        const result = buildResonitePresenceFeedUpdate(
            sparseFriend,
            nextFriend,
            {
                now: () => 7_000,
                nowIso: () => '2026-04-21T00:00:07.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'GPS',
            location: 'New World',
            worldName: 'New World',
            previousLocation: 'Old World',
            time: 5_000
        });
        expect(result.refPatch.$previousLocation).toBe('');
    });

    test('emits offline event using the last live location', () => {
        const previousFriend = makeFriend({
            location: 'The Navy Seal',
            traveling: 'The Navy Seal',
            locationAt: 3_000
        });
        const nextFriend = makeFriend({
            state: 'offline',
            status: 'busy',
            statusDescription: '',
            location: 'offline',
            traveling: ''
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 9_000,
                nowIso: () => '2026-04-21T00:00:09.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'Offline',
            location: 'The Navy Seal',
            worldName: 'The Navy Seal',
            time: 6_000
        });
        expect(result.refPatch.$offline_for).toBe(9_000);
        expect(result.refPatch.$online_for).toBe('');
    });

    test('emits offline event using the last real location after a traveling placeholder', () => {
        const previousFriend = makeFriend({
            location: 'traveling',
            traveling: 'traveling',
            locationAt: 3_000,
            previousLocation: 'Private'
        });
        const nextFriend = makeFriend({
            state: 'offline',
            status: 'busy',
            statusDescription: '',
            location: 'offline',
            traveling: ''
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 9_000,
                nowIso: () => '2026-04-21T00:00:09.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'Offline',
            location: 'Private',
            worldName: 'Private',
            time: 6_000
        });
    });

    test('emits status event when online status text changes', () => {
        const previousFriend = makeFriend({
            status: 'active',
            statusDescription: 'Online on version 2026.4.20'
        });
        const nextFriend = makeFriend({
            status: 'busy',
            statusDescription: 'Recording patch notes'
        });

        const result = buildResonitePresenceFeedUpdate(
            previousFriend,
            nextFriend,
            {
                now: () => 8_000,
                nowIso: () => '2026-04-21T00:00:08.000Z'
            }
        );

        expect(result.feedEntries[0]).toMatchObject({
            type: 'Status',
            status: 'busy',
            statusDescription: 'Recording patch notes',
            previousStatus: 'active',
            previousStatusDescription: 'Online on version 2026.4.20'
        });
    });
});
