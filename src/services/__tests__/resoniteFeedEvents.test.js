import { describe, expect, test } from 'vitest';

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
            $previousLocation: previousLocation
        },
        resonite: {
            locationName: traveling,
            currentSessionName: traveling
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
