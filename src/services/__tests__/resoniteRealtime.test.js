import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockWebApiExecute = vi.fn();
const mockConfigGetObject = vi.fn();
const mockConfigSetObject = vi.fn();
const mockConfigRemove = vi.fn();
const mockSignalRInvoke = vi.fn();

let signalRHandlers = {};

const mockHubConnection = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    invoke: (...args) => mockSignalRInvoke(...args),
    on: vi.fn((eventName, handler) => {
        signalRHandlers[eventName] = handler;
    }),
    onreconnected: vi.fn(),
    onclose: vi.fn()
};

vi.mock('@microsoft/signalr', () => ({
    HubConnectionBuilder: class {
        withUrl() {
            return this;
        }

        withAutomaticReconnect() {
            return this;
        }

        build() {
            return mockHubConnection;
        }
    },
    HttpTransportType: {
        LongPolling: 'LongPolling'
    }
}));

vi.mock('../../services/webapi', () => ({
    default: {
        execute: (...args) => mockWebApiExecute(...args)
    }
}));

vi.mock('../../services/config', () => ({
    default: {
        getObject: (...args) => mockConfigGetObject(...args),
        setObject: (...args) => mockConfigSetObject(...args),
        remove: (...args) => mockConfigRemove(...args)
    }
}));

vi.mock('../../services/resoniteAuth', () => ({
    buildResoniteAuthorizationHeader: vi.fn((apiKey) => `Bearer ${apiKey}`)
}));

import {
    buildMergedPresence,
    clearResoniteRealtimeState,
    ensureResoniteRealtimePresence,
    getResoniteSessionByHash,
    refreshResoniteSessionByHash,
    resoniteSessionCacheVersion,
    mergeResoniteRealtimePresence,
    stopResoniteRealtimePresence
} from '../resoniteRealtime';

describe('resoniteRealtime service', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        signalRHandlers = {};
        mockConfigGetObject.mockResolvedValue(null);
        mockConfigSetObject.mockResolvedValue(undefined);
        mockConfigRemove.mockResolvedValue(undefined);
        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return { contacts: [] };
            }

            return true;
        });
        resoniteSessionCacheVersion.value = 0;
        await stopResoniteRealtimePresence();
        await clearResoniteRealtimeState();
    });

    test('refreshResoniteSessionByHash caches the matched session object from array payloads', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-other',
                    name: 'Other Session'
                },
                {
                    sessionHash: 'S-hash',
                    name: 'Soft Sea of Stars',
                    sessionUsers: [{ userID: 'U-host', username: 'bokcine' }],
                    joinedUsers: 1
                }
            ])
        });

        const result = await refreshResoniteSessionByHash({
            sessionHash: 'S-hash',
            apiKey: 'U-test:session-token',
            force: true
        });

        expect(Array.isArray(result)).toBe(false);
        expect(result).toMatchObject({
            sessionHash: 'S-hash',
            name: 'Soft Sea of Stars',
            joinedUsers: 1
        });
        expect(getResoniteSessionByHash('S-hash')).toMatchObject({
            sessionHash: 'S-hash',
            name: 'Soft Sea of Stars'
        });
        expect(resoniteSessionCacheVersion.value).toBeGreaterThan(0);
    });

    test('refreshResoniteSessionByHash force=true retries after a recent miss', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 404,
            data: ''
        });

        const first = await refreshResoniteSessionByHash({
            sessionHash: 'S-miss',
            apiKey: 'U-test:session-token'
        });

        expect(first).toBeNull();
        expect(mockWebApiExecute).toHaveBeenCalledTimes(7);

        mockWebApiExecute.mockClear();
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                sessionHash: 'S-miss',
                name: 'Recovered Session'
            })
        });

        const second = await refreshResoniteSessionByHash({
            sessionHash: 'S-miss',
            apiKey: 'U-test:session-token'
        });

        expect(second).toBeNull();
        expect(mockWebApiExecute).not.toHaveBeenCalled();

        const third = await refreshResoniteSessionByHash({
            sessionHash: 'S-miss',
            apiKey: 'U-test:session-token',
            force: true
        });

        expect(mockWebApiExecute).toHaveBeenCalledTimes(1);
        expect(third).toMatchObject({
            sessionHash: 'S-miss',
            name: 'Recovered Session'
        });
    });

    test('buildMergedPresence preserves prior online status but clears stale session fields for sparse SignalR updates', () => {
        const merged = buildMergedPresence(
            'U-test',
            { userId: 'U-test' },
            {
                onlineStatus: 'online',
                locationName: 'Soft Sea of Stars',
                currentSessionName: 'Soft Sea of Stars',
                currentSessionHash: 'S-hash'
            },
            'ReceiveStatusUpdate'
        );

        expect(merged.onlineStatus).toBe('online');
        expect(merged.locationName).toBe('');
        expect(merged.currentSessionName).toBe('');
        expect(merged.currentSessionHash).toBe('');
    });

    test('ReceiveSessionUpdate overwrites stale cached session names used by sidebar/feed views', async () => {
        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-bokcine',
                            userStatus: {
                                onlineStatus: 'online',
                                locationName: 'messing around',
                                currentSessionName: 'messing around',
                                currentSessionIndex: 0,
                                sessions: [
                                    {
                                        sessionHash: 'S-cat',
                                        broadcastKey: 'U-bokcine:cat-cradle'
                                    }
                                ]
                            }
                        }
                    ]
                };
            }

            return true;
        });

        await ensureResoniteRealtimePresence({
            enabled: true,
            apiKey: 'U-test:session-token',
            contactUserIds: ['U-bokcine'],
            persistenceKey: 'test-user'
        });

        await signalRHandlers.ReceiveSessionUpdate({
            broadcastKey: 'U-bokcine:cat-cradle',
            name: "Cat's Cradle Collectable Card Shop"
        });

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-bokcine',
                name: 'bokcine',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-bokcine',
                    displayName: 'bokcine',
                    state: 'online',
                    status: 'active',
                    location: 'messing around',
                    traveling: 'messing around',
                    statusDescription: '',
                    resonite: {
                        locationName: 'messing around',
                        currentSessionName: 'messing around'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'messing around',
                    currentSessionName: 'messing around'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe(
            "Cat's Cradle Collectable Card Shop"
        );
        expect(merged[0].ref.traveling).toBe(
            "Cat's Cradle Collectable Card Shop"
        );
        expect(merged[0].resonite.locationName).toBe(
            "Cat's Cradle Collectable Card Shop"
        );
        expect(merged[0].resonite.currentSessionName).toBe(
            "Cat's Cradle Collectable Card Shop"
        );
    });

    test('buildMergedPresence prefers Private over stale session names when access level is private', () => {
        const merged = buildMergedPresence(
            'U-private',
            {
                userStatus: {
                    onlineStatus: 'online',
                    currentSessionIndex: 0,
                    sessions: [
                        {
                            accessLevel: 'private',
                            sessionHash: 'S-private'
                        }
                    ]
                }
            },
            {
                userId: 'U-private',
                onlineStatus: 'online',
                locationName: 'Old World',
                currentSessionName: 'Old World',
                currentSessionHash: 'S-old'
            },
            'ReceiveStatusUpdate'
        );

        expect(merged.locationName).toBe('Private');
        expect(merged.currentSessionName).toBe('Private');
        expect(merged.currentSessionHash).toBe('S-private');
    });
});
