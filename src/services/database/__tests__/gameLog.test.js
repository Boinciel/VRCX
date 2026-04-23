import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execute: vi.fn()
}));

vi.mock('../../sqlite.js', () => ({
    default: {
        execute: mocks.execute,
        executeNonQuery: vi.fn()
    }
}));
vi.mock('../index.js', () => ({
    dbVars: {
        maxTableSize: 500,
        userPrefix: ''
    }
}));

import { gameLog } from '../gameLog.js';

describe('gameLog.getMyTopWorlds', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('adds an exclude clause when a home world id is provided', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            callback(['wrld_1', 'World One', 3, 9000]);
            return undefined;
        });

        const result = await gameLog.getMyTopWorlds(30, 5, 'time', 'wrld_home');

        expect(result).toEqual([
            {
                worldId: 'wrld_1',
                worldName: 'World One',
                visitCount: 3,
                totalTime: 9000
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][1]).toContain(
            'AND world_id != @excludeWorldId'
        );
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({
            '@limit': 5,
            '@daysOffset': '-30 days',
            '@excludeWorldId': 'wrld_home'
        });
    });
});

describe('gameLog.getUserStats', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('uses feed-backed presence history for Resonite users', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (sql.includes('MAX(created_at)')) {
                callback(['2026-04-22T06:35:00.000Z']);
                return;
            }

            if (sql.includes('COUNT(DISTINCT location)')) {
                callback([3]);
                return;
            }

            if (sql.includes('COALESCE(SUM(time), 0)')) {
                callback([5_400_000]);
            }
        });

        const result = await gameLog.getUserStats(
            {
                id: 'resonite:U-1m6uEMdcCeW',
                displayName: 'Vilhelm'
            },
            false
        );

        expect(result).toEqual({
            timeSpent: 5_400_000,
            lastSeen: '2026-04-22T06:35:00.000Z',
            joinCount: 3,
            userId: 'resonite:U-1m6uEMdcCeW',
            previousDisplayNames: new Map()
        });
        expect(mocks.execute).toHaveBeenCalledTimes(3);
        for (const [, sql] of mocks.execute.mock.calls) {
            expect(sql).not.toContain('gamelog_join_leave');
            expect(sql).not.toContain('display_name = @displayName');
        }
    });

    test('does not merge Resonite stats by display name when another user shares the same name', async () => {
        mocks.execute.mockImplementation(async (callback, _sql, params) => {
            expect(params).toEqual({ '@userId': 'resonite:U-1mImOh1WI08' });
            callback([0]);
        });

        const result = await gameLog.getUserStats(
            {
                id: 'resonite:U-1mImOh1WI08',
                displayName: 'PVNISHED'
            },
            false
        );

        expect(result).toEqual({
            timeSpent: 0,
            lastSeen: '',
            joinCount: 0,
            userId: 'resonite:U-1mImOh1WI08',
            previousDisplayNames: new Map()
        });
        expect(mocks.execute).toHaveBeenCalledTimes(3);
    });

    test('excludes synthetic private locations from Resonite join counts', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (sql.includes('MAX(created_at)')) {
                callback(['2026-04-22T06:35:00.000Z']);
                return;
            }

            if (sql.includes('COUNT(DISTINCT location)')) {
                callback([1]);
                return;
            }

            if (sql.includes('COALESCE(SUM(time), 0)')) {
                callback([900_000]);
            }
        });

        const result = await gameLog.getUserStats(
            {
                id: 'resonite:U-private-count',
                displayName: 'Private Counter'
            },
            false
        );

        expect(result.joinCount).toBe(1);
        expect(mocks.execute).toHaveBeenCalledTimes(3);
        expect(mocks.execute.mock.calls[1][1]).toContain(
            "LOWER(TRIM(location)) NOT IN ('offline', 'traveling', 'private')"
        );
    });

    test('includes feed-backed stats for Resonite users in bulk lookups', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (sql.includes('ORDER BY user_id ASC, created_at DESC')) {
                callback([
                    '2026-04-22T07:44:00.000Z',
                    'resonite:U-1m6uEMdcCeW',
                    'Vilhelm',
                    'The Fishing Mall',
                    1_200_000
                ]);
                callback([
                    '2026-04-22T07:24:00.000Z',
                    'resonite:U-1m6uEMdcCeW',
                    'Vilhelm',
                    null,
                    2_400_000
                ]);
                callback([
                    '2026-04-22T06:35:00.000Z',
                    'resonite:U-1m6uEMdcCeW',
                    'Vilhelm',
                    null,
                    0
                ]);
                return;
            }

            if (sql.includes('gamelog_join_leave')) {
                callback([
                    '2026-04-21T05:00:00.000Z',
                    'usr_vrchat_1',
                    600_000,
                    1,
                    'VRChatUser'
                ]);
            }
        });

        const result = await gameLog.getAllUserStats(
            ['usr_vrchat_1', 'resonite:U-1m6uEMdcCeW'],
            ['VRChatUser', 'Vilhelm']
        );

        expect(result).toEqual(
            expect.arrayContaining([
                {
                    lastSeen: '2026-04-21T05:00:00.000Z',
                    userId: 'usr_vrchat_1',
                    timeSpent: 600_000,
                    joinCount: 1,
                    displayName: 'VRChatUser'
                },
                {
                    lastSeen: '2026-04-22T07:44:00.000Z',
                    userId: 'resonite:U-1m6uEMdcCeW',
                    timeSpent: 3_600_000,
                    joinCount: 1,
                    displayName: 'Vilhelm'
                }
            ])
        );
    });
});

describe('gameLog.getPreviousInstancesByUserId', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('uses feed-backed history for Resonite users', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (
                sql.includes('_feed_online_offline') &&
                sql.includes('_feed_gps')
            ) {
                callback([
                    '2026-04-22T06:00:00.000Z',
                    Date.parse('2026-04-22T06:00:00.000Z'),
                    'The Fishing Mall',
                    'The Fishing Mall',
                    '',
                    '',
                    null,
                    'Online'
                ]);
                callback([
                    '2026-04-22T06:45:00.000Z',
                    Date.parse('2026-04-22T06:45:00.000Z'),
                    'Zen Garden',
                    'Zen Garden',
                    '',
                    2_700_000,
                    'The Fishing Mall',
                    'GPS'
                ]);
                callback([
                    '2026-04-22T07:30:00.000Z',
                    Date.parse('2026-04-22T07:30:00.000Z'),
                    'Zen Garden',
                    'Zen Garden',
                    '',
                    2_700_000,
                    null,
                    'Offline'
                ]);
            }
        });

        const result = await gameLog.getPreviousInstancesByUserId({
            id: 'resonite:U-1m6uEMdcCeW',
            displayName: 'Vilhelm'
        });

        expect(Array.from(result)).toEqual([
            {
                created_at: '2026-04-22T06:00:00.000Z',
                location: 'The Fishing Mall',
                time: 2_700_000,
                worldName: 'The Fishing Mall',
                groupName: '',
                events: [],
                last_ts: Date.parse('2026-04-22T06:45:00.000Z')
            },
            {
                created_at: '2026-04-22T06:45:00.000Z',
                location: 'Zen Garden',
                time: 2_700_000,
                worldName: 'Zen Garden',
                groupName: '',
                events: [],
                last_ts: Date.parse('2026-04-22T07:30:00.000Z')
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][1]).not.toContain(
            'gamelog_join_leave'
        );
    });

    test('filters Resonite history to exact shared Resonite locations when requested', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (
                sql.includes('_feed_online_offline') &&
                sql.includes('_feed_gps') &&
                sql.includes('WHERE user_id = @userId') &&
                sql.includes('world_name')
            ) {
                callback([
                    '2026-04-22T06:35:49.000Z',
                    Date.parse('2026-04-22T06:35:49.000Z'),
                    '[WIP] A Safe0V3R Map',
                    '[WIP] A Safe0V3R Map',
                    '',
                    '',
                    null,
                    'Online'
                ]);
                callback([
                    '2026-04-22T06:55:49.000Z',
                    Date.parse('2026-04-22T06:55:49.000Z'),
                    'Zen Garden',
                    'Zen Garden',
                    '',
                    1_200_000,
                    '[WIP] A Safe0V3R Map',
                    'GPS'
                ]);
                callback([
                    '2026-04-22T07:15:49.000Z',
                    Date.parse('2026-04-22T07:15:49.000Z'),
                    'Zen Garden',
                    'Zen Garden',
                    '',
                    1_200_000,
                    null,
                    'Offline'
                ]);
                return;
            }

            if (
                sql.includes('_feed_online_offline') &&
                sql.includes('_feed_gps') &&
                sql.includes('WHERE user_id = @userId')
            ) {
                callback([
                    '2026-04-22T06:30:00.000Z',
                    Date.parse('2026-04-22T06:30:00.000Z'),
                    'Another World',
                    '',
                    1_200_000,
                    null,
                    'Online'
                ]);
                callback([
                    '2026-04-22T07:00:00.000Z',
                    Date.parse('2026-04-22T07:00:00.000Z'),
                    'Zen Garden',
                    '',
                    1_200_000,
                    null,
                    'Online'
                ]);
            }
        });

        const result = await gameLog.getPreviousInstancesByUserId({
            id: 'resonite:U-1m6uEMdcCeW',
            displayName: 'Vilhelm',
            sharedOnly: true,
            sharedWithUserId: 'resonite:U-self'
        });

        expect(Array.from(result)).toEqual([
            {
                created_at: '2026-04-22T06:55:49.000Z',
                location: 'Zen Garden',
                time: 1_200_000,
                worldName: 'Zen Garden',
                groupName: '',
                events: [],
                last_ts: Date.parse('2026-04-22T07:15:49.000Z')
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(2);
    });

    test('does not treat overlapping private sessions as a shared Resonite world', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (
                sql.includes('_feed_online_offline') &&
                sql.includes('_feed_gps') &&
                sql.includes('WHERE user_id = @userId') &&
                sql.includes('world_name')
            ) {
                callback([
                    '2026-04-22T06:35:49.000Z',
                    Date.parse('2026-04-22T06:35:49.000Z'),
                    'Private',
                    'Private',
                    '',
                    '',
                    null,
                    'Online'
                ]);
                callback([
                    '2026-04-22T06:55:49.000Z',
                    Date.parse('2026-04-22T06:55:49.000Z'),
                    'Zen Garden',
                    'Zen Garden',
                    '',
                    1_200_000,
                    'Private',
                    'GPS'
                ]);
                callback([
                    '2026-04-22T07:15:49.000Z',
                    Date.parse('2026-04-22T07:15:49.000Z'),
                    'Zen Garden',
                    'Zen Garden',
                    '',
                    1_200_000,
                    null,
                    'Offline'
                ]);
                return;
            }

            if (
                sql.includes('_feed_online_offline') &&
                sql.includes('_feed_gps') &&
                sql.includes('WHERE user_id = @userId')
            ) {
                callback([
                    '2026-04-22T06:30:00.000Z',
                    Date.parse('2026-04-22T06:30:00.000Z'),
                    'Private',
                    '',
                    1_200_000,
                    null,
                    'Online'
                ]);
                callback([
                    '2026-04-22T07:00:00.000Z',
                    Date.parse('2026-04-22T07:00:00.000Z'),
                    'Zen Garden',
                    '',
                    1_200_000,
                    null,
                    'Online'
                ]);
            }
        });

        const result = await gameLog.getPreviousInstancesByUserId({
            id: 'resonite:U-1m6uEMdcCeW',
            displayName: 'Vilhelm',
            sharedOnly: true,
            sharedWithUserId: 'resonite:U-self'
        });

        expect(Array.from(result)).toEqual([
            {
                created_at: '2026-04-22T06:55:49.000Z',
                location: 'Zen Garden',
                time: 1_200_000,
                worldName: 'Zen Garden',
                groupName: '',
                events: [],
                last_ts: Date.parse('2026-04-22T07:15:49.000Z')
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(2);
    });
});
