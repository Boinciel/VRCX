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

import { tableAlter } from '../tableAlter.js';

describe('database.tableAlter', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
        mocks.executeNonQuery.mockReset();
    });

    test('adds provider columns to feed tables during compatibility upgrades', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (
                sql.includes("name LIKE '%_feed_gps'") &&
                sql.includes('%_feed_online_offline')
            ) {
                callback(['test_feed_gps']);
                callback(['test_feed_status']);
                callback(['test_feed_bio']);
                callback(['test_feed_avatar']);
                callback(['test_feed_online_offline']);
            }
        });

        await tableAlter.addProviderColumnsToFeedTables();

        expect(mocks.executeNonQuery.mock.calls).toEqual([
            ["ALTER TABLE test_feed_gps ADD provider TEXT DEFAULT ''"],
            ["ALTER TABLE test_feed_status ADD provider TEXT DEFAULT ''"],
            ["ALTER TABLE test_feed_bio ADD provider TEXT DEFAULT ''"],
            ["ALTER TABLE test_feed_avatar ADD provider TEXT DEFAULT ''"],
            [
                "ALTER TABLE test_feed_online_offline ADD provider TEXT DEFAULT ''"
            ]
        ]);
    });

    test('adds snapshot backoff columns to Resonite sync-state tables during compatibility upgrades', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (sql.includes("name LIKE '%_resonite_sync_state_v1'")) {
                callback(['test_resonite_sync_state_v1']);
            }
        });

        await tableAlter.addResoniteSyncStateBackoffColumns();

        expect(mocks.executeNonQuery.mock.calls).toEqual([
            [
                'ALTER TABLE test_resonite_sync_state_v1 ADD snapshot_failure_count INTEGER DEFAULT 0'
            ],
            [
                'ALTER TABLE test_resonite_sync_state_v1 ADD next_snapshot_retry_at INTEGER DEFAULT 0'
            ],
            [
                'ALTER TABLE test_resonite_sync_state_v1 ADD presence_failure_count INTEGER DEFAULT 0'
            ],
            [
                'ALTER TABLE test_resonite_sync_state_v1 ADD next_presence_retry_at INTEGER DEFAULT 0'
            ]
        ]);
    });
});
