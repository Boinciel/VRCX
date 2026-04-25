import { describe, expect, test } from 'vitest';

import {
    calculateResoniteRefreshDelaySeconds,
    getResoniteRefreshScopeKey
} from '../updateLoopResonite';

describe('updateLoopResonite helpers', () => {
    test('builds a persistence scope key from the current user id', () => {
        expect(getResoniteRefreshScopeKey('usr_test')).toBe(
            'vrcx-user-usr_test'
        );
        expect(getResoniteRefreshScopeKey('')).toBe('');
    });

    test('returns the base refresh interval when no retry window is active', () => {
        expect(calculateResoniteRefreshDelaySeconds(null, 300, 1_000)).toBe(
            300
        );
    });

    test('returns the remaining retry-window delay when snapshot backoff is active', () => {
        expect(
            calculateResoniteRefreshDelaySeconds(
                {
                    nextSnapshotRetryAt: 16_000,
                    lastErrorText: 'fetch-failed'
                },
                300,
                10_500
            )
        ).toBe(6);
    });
});
