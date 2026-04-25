import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execute: vi.fn(),
    executeNonQuery: vi.fn()
}));

vi.mock('../../sqlite.js', () => ({
    default: {
        execute: mocks.execute,
        executeNonQuery: mocks.executeNonQuery
    }
}));

vi.mock('../index.js', () => ({
    dbVars: {
        userPrefix: 'testuser'
    }
}));

import { resoniteCache } from '../resoniteCache.js';

describe('database.resoniteCache', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
        mocks.executeNonQuery.mockReset();
    });

    test('initializes all Resonite cache tables and indexes', async () => {
        await resoniteCache.initResoniteCacheTables();

        const sqlStatements = mocks.executeNonQuery.mock.calls.map(
            ([sql]) => sql
        );

        expect(sqlStatements).toEqual(
            expect.arrayContaining([
                expect.stringContaining('testuser_resonite_contacts_cache_v1'),
                expect.stringContaining('testuser_resonite_profiles_cache_v1'),
                expect.stringContaining('testuser_resonite_presence_cache_v1'),
                expect.stringContaining('testuser_resonite_session_cache_v1'),
                expect.stringContaining('testuser_resonite_sync_state_v1'),
                expect.stringContaining('testuser_resonite_contacts_user_idx'),
                expect.stringContaining(
                    'testuser_resonite_presence_session_idx'
                )
            ])
        );
    });

    test('reads cached contacts with parsed payload and normalized booleans', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            expect(sql).toContain('FROM testuser_resonite_contacts_cache_v1');
            callback([
                'resonite:U-1',
                'U-1',
                'Alpha',
                'alpha',
                'alpha',
                'accepted',
                1,
                '2026-04-24T00:00:00.000Z',
                1,
                100,
                200,
                'rev-1',
                '{"tag":"value"}'
            ]);
        });

        const result = await resoniteCache.getResoniteCachedContacts();

        expect(result).toEqual([
            {
                externalId: 'resonite:U-1',
                resoniteUserId: 'U-1',
                displayName: 'Alpha',
                username: 'alpha',
                normalizedUsername: 'alpha',
                contactStatus: 'accepted',
                isAccepted: 1,
                latestMessageTime: '2026-04-24T00:00:00.000Z',
                isSystemContact: true,
                fetchedAt: 100,
                lastSuccessfulSnapshotAt: 200,
                sourceRevision: 'rev-1',
                payload: { tag: 'value' }
            }
        ]);
    });

    test('writes cached profile rows with normalized booleans and json payloads', () => {
        resoniteCache.upsertResoniteCachedProfile({
            resoniteUserId: 'U-2',
            displayName: 'Beta',
            username: 'beta',
            registrationDate: '2026-04-20T00:00:00.000Z',
            isVerified: true,
            tags: ['builder', 'friend'],
            iconUrl: 'https://example.com/icon.png',
            tagline: 'Building',
            description: 'Description',
            fetchedAt: 300,
            expiresAt: 400,
            payload: { profile: true }
        });

        expect(mocks.executeNonQuery).toHaveBeenCalledTimes(1);
        expect(mocks.executeNonQuery.mock.calls[0][0]).toContain(
            'INSERT OR REPLACE INTO testuser_resonite_profiles_cache_v1'
        );
        expect(mocks.executeNonQuery.mock.calls[0][1]).toMatchObject({
            '@resonite_user_id': 'U-2',
            '@is_verified': 1,
            '@tags_json': '["builder","friend"]',
            '@payload_json': '{"profile":true}'
        });
    });

    test('filters cached presence rows by distinct user ids and parses payload json', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            expect(sql).toContain("WHERE resonite_user_id IN ('U-3')");
            callback([
                'U-3',
                'online',
                'Zen Garden',
                'S-1',
                'Zen Garden',
                'session-1',
                'VR',
                'Desktop',
                '2026.4.24',
                'compat',
                0,
                1,
                500,
                600,
                'InitializeStatus',
                '{"present":true}'
            ]);
        });

        const result = await resoniteCache.getResoniteCachedPresence([
            ' U-3 ',
            'U-3',
            ''
        ]);

        expect(result).toEqual([
            {
                resoniteUserId: 'U-3',
                onlineStatus: 'online',
                locationName: 'Zen Garden',
                currentSessionHash: 'S-1',
                currentSessionName: 'Zen Garden',
                userSessionId: 'session-1',
                sessionType: 'VR',
                outputDevice: 'Desktop',
                appVersion: '2026.4.24',
                compatibilityHash: 'compat',
                isMobile: 0,
                isPresent: 1,
                observedAt: 500,
                expiresAt: 600,
                source: 'InitializeStatus',
                payload: { present: true }
            }
        ]);
    });

    test('replaces cached session rows by clearing first and inserting each entry', async () => {
        await resoniteCache.replaceResoniteCachedSessions([
            {
                sessionHash: 'S-1',
                sessionName: 'World One',
                hostUserId: 'U-host',
                observedAt: 700,
                expiresAt: 800,
                payload: { joinedUsers: 5 }
            }
        ]);

        expect(mocks.executeNonQuery).toHaveBeenCalledTimes(2);
        expect(mocks.executeNonQuery.mock.calls[0][0]).toBe(
            'DELETE FROM testuser_resonite_session_cache_v1'
        );
        expect(mocks.executeNonQuery.mock.calls[1][0]).toContain(
            'INSERT OR REPLACE INTO testuser_resonite_session_cache_v1'
        );
        expect(mocks.executeNonQuery.mock.calls[1][1]).toMatchObject({
            '@session_hash': 'S-1',
            '@payload_json': '{"joinedUsers":5}'
        });
    });

    test('reads sync state using normalized default scope', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            expect(sql).toContain('FROM testuser_resonite_sync_state_v1');
            expect(params).toEqual({ '@scope': 'default' });
            callback([
                'default',
                10,
                20,
                30,
                'none',
                'rev-2',
                'U-self',
                2,
                40,
                3,
                50
            ]);
        });

        const result = await resoniteCache.getResoniteSyncState('');

        expect(result).toEqual({
            scope: 'default',
            lastAttemptAt: 10,
            lastSuccessfulSnapshotAt: 20,
            lastSuccessfulPresenceAt: 30,
            lastErrorText: 'none',
            snapshotRevision: 'rev-2',
            activeResoniteUserId: 'U-self',
            snapshotFailureCount: 2,
            nextSnapshotRetryAt: 40,
            presenceFailureCount: 3,
            nextPresenceRetryAt: 50
        });
    });

    test('merges partial sync-state updates instead of clearing existing fields', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (sql.includes('FROM testuser_resonite_sync_state_v1')) {
                callback([
                    'default',
                    10,
                    20,
                    30,
                    'fetch-failed',
                    'rev-2',
                    'U-self',
                    3,
                    90,
                    4,
                    120
                ]);
            }
        });

        await resoniteCache.setResoniteSyncState({
            scope: 'default',
            lastSuccessfulPresenceAt: 35,
            activeResoniteUserId: 'U-updated'
        });

        expect(mocks.executeNonQuery).toHaveBeenCalledWith(
            expect.stringContaining(
                'INSERT OR REPLACE INTO testuser_resonite_sync_state_v1'
            ),
            expect.objectContaining({
                '@scope': 'default',
                '@last_attempt_at': 10,
                '@last_successful_snapshot_at': 20,
                '@last_successful_presence_at': 35,
                '@last_error_text': 'fetch-failed',
                '@snapshot_revision': 'rev-2',
                '@active_resonite_user_id': 'U-updated',
                '@snapshot_failure_count': 3,
                '@next_snapshot_retry_at': 90,
                '@presence_failure_count': 4,
                '@next_presence_retry_at': 120
            })
        );
    });

    test('prunes expired profile, presence, and session cache rows using cutoff', async () => {
        await resoniteCache.pruneExpiredResoniteCache(900);

        expect(mocks.executeNonQuery.mock.calls).toEqual([
            [
                'DELETE FROM testuser_resonite_profiles_cache_v1 WHERE expires_at > 0 AND expires_at <= @cutoff',
                { '@cutoff': 900 }
            ],
            [
                'DELETE FROM testuser_resonite_presence_cache_v1 WHERE expires_at > 0 AND expires_at <= @cutoff',
                { '@cutoff': 900 }
            ],
            [
                'DELETE FROM testuser_resonite_session_cache_v1 WHERE expires_at > 0 AND expires_at <= @cutoff',
                { '@cutoff': 900 }
            ]
        ]);
    });

    test('clears all Resonite cache tables including sync state', async () => {
        await resoniteCache.clearResoniteCache();

        expect(mocks.executeNonQuery.mock.calls.map(([sql]) => sql)).toEqual([
            'DELETE FROM testuser_resonite_contacts_cache_v1',
            'DELETE FROM testuser_resonite_profiles_cache_v1',
            'DELETE FROM testuser_resonite_presence_cache_v1',
            'DELETE FROM testuser_resonite_session_cache_v1',
            'DELETE FROM testuser_resonite_sync_state_v1'
        ]);
    });
});
