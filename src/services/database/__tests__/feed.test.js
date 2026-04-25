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
        maxTableSize: 500,
        searchTableSize: 5000,
        userPrefix: 'testuser'
    }
}));

import { feed } from '../feed.js';

describe('database.feed', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
        mocks.executeNonQuery.mockReset();
    });

    test('persists provider when writing GPS feed rows', () => {
        feed.addGPSToDatabase({
            created_at: '2026-04-24T00:00:00.000Z',
            userId: 'resonite:U-feed',
            displayName: 'Feed User',
            provider: 'resonite',
            location: 'World',
            worldName: 'World',
            previousLocation: '',
            time: 0,
            groupName: ''
        });

        expect(mocks.executeNonQuery).toHaveBeenCalledTimes(1);
        expect(mocks.executeNonQuery.mock.calls[0][0]).toContain('provider');
        expect(mocks.executeNonQuery.mock.calls[0][1]).toMatchObject({
            '@provider': 'resonite'
        });
    });

    test('surfaces provider from lookupFeedDatabase rows', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            expect(sql).toContain('provider');
            callback([
                1,
                '2026-04-24T00:00:00.000Z',
                'resonite:U-feed',
                'Feed User',
                'resonite',
                'GPS',
                'wrld_test:1',
                'Feed World',
                'wrld_prev:1',
                120000,
                'Group'
            ]);
        });

        const result = await feed.lookupFeedDatabase(['GPS'], [], 10);

        expect(result).toEqual([
            {
                rowId: 1,
                created_at: '2026-04-24T00:00:00.000Z',
                userId: 'resonite:U-feed',
                displayName: 'Feed User',
                provider: 'resonite',
                type: 'GPS',
                location: 'wrld_test:1',
                worldName: 'Feed World',
                previousLocation: 'wrld_prev:1',
                time: 120000,
                groupName: 'Group'
            }
        ]);
    });

    test('applies compatibility-safe Resonite provider filtering in lookup queries', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            expect(sql).toContain('provider = @provider');
            expect(sql).toContain("provider = ''");
            expect(sql).toContain("user_id LIKE 'resonite:%'");
            expect(params).toMatchObject({
                '@provider': 'resonite'
            });
            callback([
                3,
                '2026-04-24T00:00:00.000Z',
                'resonite:U-legacy',
                'Legacy Resonite',
                '',
                'GPS',
                'resrec:///world',
                'Legacy World',
                '',
                60000,
                ''
            ]);
        });

        const result = await feed.lookupFeedDatabase(
            ['GPS'],
            [],
            10,
            'resonite'
        );

        expect(result).toEqual([
            expect.objectContaining({
                userId: 'resonite:U-legacy',
                provider: ''
            })
        ]);
    });

    test('surfaces provider from searchFeedDatabase rows', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            expect(sql).toContain('provider');
            callback([
                2,
                '2026-04-24T00:00:00.000Z',
                'resonite:U-feed',
                'Feed User',
                'resonite',
                'Status',
                null,
                null,
                null,
                null,
                null,
                'active',
                'Building',
                'busy',
                'Old status',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            ]);
        });

        const result = await feed.searchFeedDatabase('Feed', ['Status'], []);

        expect(result).toEqual([
            {
                rowId: 2,
                created_at: '2026-04-24T00:00:00.000Z',
                userId: 'resonite:U-feed',
                displayName: 'Feed User',
                provider: 'resonite',
                type: 'Status',
                status: 'active',
                statusDescription: 'Building',
                previousStatus: 'busy',
                previousStatusDescription: 'Old status'
            }
        ]);
    });

    test('applies compatibility-safe VRChat provider filtering in search queries', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            expect(sql).toContain('provider = @provider');
            expect(sql).toContain("provider = ''");
            expect(sql).toContain("user_id NOT LIKE 'resonite:%'");
            expect(params).toMatchObject({
                '@provider': 'vrchat'
            });
            callback([
                4,
                '2026-04-24T00:00:00.000Z',
                'usr_vrchat',
                'VRChat User',
                '',
                'Status',
                null,
                null,
                null,
                null,
                null,
                'active',
                'Working',
                'join me',
                'Old',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            ]);
        });

        const result = await feed.searchFeedDatabase(
            'VRChat',
            ['Status'],
            [],
            10,
            '',
            '',
            'vrchat'
        );

        expect(result).toEqual([
            expect.objectContaining({
                userId: 'usr_vrchat',
                provider: ''
            })
        ]);
    });

    test('forwards provider filtering into instance lookups', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            expect(sql).toContain('location LIKE @instanceLike');
            expect(sql).toContain('provider = @provider');
            expect(params).toMatchObject({
                '@provider': 'resonite',
                '@instanceLike': '%wrld_test%'
            });
            callback([
                5,
                '2026-04-24T00:00:00.000Z',
                'resonite:U-instance',
                'Instance User',
                'resonite',
                'Online',
                'wrld_test:1',
                'Instance World',
                null,
                5000,
                'Group'
            ]);
        });

        const result = await feed.searchFeedDatabase(
            'wrld_test',
            ['Online'],
            [],
            10,
            '',
            '',
            'resonite'
        );

        expect(result).toEqual([
            expect.objectContaining({
                userId: 'resonite:U-instance',
                provider: 'resonite',
                type: 'Online'
            })
        ]);
    });
});
