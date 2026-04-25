import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockWebApiExecute = vi.fn();
const mockConfigGetObject = vi.fn();
const mockConfigSetObject = vi.fn();
const mockConfigRemove = vi.fn();
const mockSignalRInvoke = vi.fn();
const { mockDatabase } = vi.hoisted(() => ({
    mockDatabase: {
        getResoniteCachedPresence: vi.fn(),
        replaceResoniteCachedPresence: vi.fn(),
        clearResoniteCachedPresence: vi.fn(),
        getResoniteCachedSessions: vi.fn(),
        replaceResoniteCachedSessions: vi.fn(),
        clearResoniteCachedSessions: vi.fn(),
        setResoniteSyncState: vi.fn()
    }
}));

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

vi.mock('../../services/database', () => ({
    database: mockDatabase
}));

import {
    buildMergedPresence,
    clearResoniteRealtimeState,
    ensureResoniteRealtimePresence,
    getResoniteSessionByHash,
    hydratePersistedResoniteRealtimeState,
    reconcileResoniteRealtimeAgainstSnapshot,
    persistResoniteRealtimeState,
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
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([]);
        mockDatabase.replaceResoniteCachedPresence.mockResolvedValue(undefined);
        mockDatabase.clearResoniteCachedPresence.mockResolvedValue(undefined);
        mockDatabase.getResoniteCachedSessions.mockResolvedValue([]);
        mockDatabase.replaceResoniteCachedSessions.mockResolvedValue(undefined);
        mockDatabase.clearResoniteCachedSessions.mockResolvedValue(undefined);
        mockDatabase.setResoniteSyncState.mockResolvedValue(undefined);
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
        expect(mockWebApiExecute).toHaveBeenCalledTimes(1);

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

    test('buildMergedPresence treats sparse SignalR updates as offline and clears stale session fields', () => {
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

        expect(merged.onlineStatus).toBe('offline');
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

    test('ReceiveSessionUpdate ignores inactive cached sessions for the same user', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 404,
            data: ''
        });

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-vilhelm',
                            userStatus: {
                                onlineStatus: 'online',
                                locationName: 'Grid Shaped [Flashing Lights]',
                                currentSessionName:
                                    'Grid Shaped [Flashing Lights]',
                                currentSessionHash: 'S-grid',
                                currentSessionIndex: 1,
                                sessions: [
                                    {
                                        sessionHash: 'S-cat',
                                        broadcastKey: 'U-vilhelm:cat-cradle'
                                    },
                                    {
                                        sessionHash: 'S-grid',
                                        broadcastKey: 'U-vilhelm:grid-shaped'
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
            contactUserIds: ['U-vilhelm'],
            persistenceKey: 'test-user'
        });

        await signalRHandlers.ReceiveSessionUpdate({
            broadcastKey: 'U-vilhelm:cat-cradle',
            name: "Cat's Cradle Daycare"
        });

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-vilhelm',
                name: 'Vilhelm',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-vilhelm',
                    displayName: 'Vilhelm',
                    state: 'online',
                    status: 'active',
                    location: 'Grid Shaped [Flashing Lights]',
                    traveling: 'Grid Shaped [Flashing Lights]',
                    statusDescription: '',
                    resonite: {
                        locationName: 'Grid Shaped [Flashing Lights]',
                        currentSessionName: 'Grid Shaped [Flashing Lights]',
                        currentSessionHash: 'S-grid'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'Grid Shaped [Flashing Lights]',
                    currentSessionName: 'Grid Shaped [Flashing Lights]',
                    currentSessionHash: 'S-grid'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('Grid Shaped [Flashing Lights]');
        expect(merged[0].ref.traveling).toBe('Grid Shaped [Flashing Lights]');
        expect(merged[0].resonite.currentSessionHash).toBe('S-grid');
        expect(merged[0].resonite.currentSessionName).toBe(
            'Grid Shaped [Flashing Lights]'
        );
    });

    test('resolved session names do not overwrite newer explicit realtime locations', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                sessionHash: 'S-cat',
                name: "Cat's Cradle Daycare"
            })
        });

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-vilhelm',
                            userStatus: {
                                onlineStatus: 'online',
                                locationName: "Cat's Cradle Daycare",
                                currentSessionName: "Cat's Cradle Daycare",
                                currentSessionHash: 'S-cat',
                                currentSessionIndex: 0,
                                sessions: [
                                    {
                                        sessionHash: 'S-cat',
                                        broadcastKey: 'U-vilhelm:cat-cradle'
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
            contactUserIds: ['U-vilhelm'],
            persistenceKey: 'test-user'
        });

        signalRHandlers.ReceiveStatusUpdate({
            userId: 'U-vilhelm',
            onlineStatus: 'online',
            locationName: 'keyemail World'
        });

        await Promise.resolve();
        await Promise.resolve();

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-vilhelm',
                name: 'Vilhelm',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-vilhelm',
                    displayName: 'Vilhelm',
                    state: 'online',
                    status: 'active',
                    location: 'keyemail World',
                    traveling: 'keyemail World',
                    statusDescription: '',
                    resonite: {
                        locationName: 'keyemail World',
                        currentSessionName: 'keyemail World',
                        currentSessionHash: 'S-cat'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'keyemail World',
                    currentSessionName: 'keyemail World',
                    currentSessionHash: 'S-cat'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('keyemail World');
        expect(merged[0].ref.traveling).toBe('keyemail World');
        expect(merged[0].resonite.currentSessionHash).toBe('S-cat');
        expect(merged[0].resonite.currentSessionName).toBe('keyemail World');
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

    test('hydrates persisted realtime session cache from database before legacy config fallback', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-db-presence',
                onlineStatus: 'online',
                locationName: 'Database World',
                currentSessionHash: 'S-db-presence',
                currentSessionName: 'Database World',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                source: 'InitializeStatus',
                payload: {
                    userId: 'U-db-presence',
                    onlineStatus: 'online',
                    locationName: 'Database World',
                    currentSessionHash: 'S-db-presence',
                    currentSessionName: 'Database World',
                    sessions: [],
                    updatedAt: Date.now(),
                    sourceEvent: 'InitializeStatus'
                }
            }
        ]);
        mockDatabase.getResoniteCachedSessions.mockResolvedValue([
            {
                sessionHash: 'S-db',
                sessionName: 'Database Session',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                payload: {
                    sessionHash: 'S-db',
                    name: 'Database Session',
                    joinedUsers: 3
                }
            }
        ]);

        const hydrated =
            await hydratePersistedResoniteRealtimeState('test-user');

        expect(hydrated).toBe(true);
        expect(getResoniteSessionByHash('S-db')).toMatchObject({
            sessionHash: 'S-db',
            name: 'Database Session',
            joinedUsers: 3
        });
        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-db-presence',
                name: 'Database Presence',
                state: 'offline',
                status: '',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-db-presence',
                    displayName: 'Database Presence',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: ''
                },
                resonite: {
                    onlineStatus: 'offline'
                }
            }
        ]);
        expect(merged[0].state).toBe('online');
        expect(merged[0].ref.location).toBe('Database World');
        expect(mockConfigGetObject).not.toHaveBeenCalled();
    });

    test('newer offline snapshots prune older cached realtime presence before merge', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-stale',
                onlineStatus: 'online',
                locationName: 'Old World',
                currentSessionHash: 'S-old',
                currentSessionName: 'Old World',
                observedAt: 100,
                expiresAt: Date.now() + 60_000,
                source: 'InitializeStatus',
                payload: {
                    userId: 'U-stale',
                    onlineStatus: 'online',
                    locationName: 'Old World',
                    currentSessionHash: 'S-old',
                    currentSessionName: 'Old World',
                    sessions: [],
                    updatedAt: 100,
                    sourceEvent: 'InitializeStatus'
                }
            }
        ]);

        await hydratePersistedResoniteRealtimeState('test-user');

        const offlineSnapshot = [
            {
                id: 'resonite:U-stale',
                name: 'Stale User',
                state: 'offline',
                status: '',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-stale',
                    displayName: 'Stale User',
                    state: 'offline',
                    location: 'offline',
                    traveling: ''
                },
                resonite: {
                    onlineStatus: 'offline',
                    contactObservedAt: 200
                }
            }
        ];

        expect(reconcileResoniteRealtimeAgainstSnapshot(offlineSnapshot)).toBe(
            1
        );

        const merged = mergeResoniteRealtimePresence(offlineSnapshot);
        expect(merged[0].state).toBe('offline');
        expect(merged[0].ref.location).toBe('offline');
        expect(merged[0].resonite.currentSessionHash || '').toBe('');
    });

    test('snapshot session fields outrank resolved-name cache during merge', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-authority',
                onlineStatus: 'online',
                locationName: 'Resolved World',
                statusDescription: 'Resolved status',
                currentSessionHash: '',
                currentSessionName: 'Resolved World',
                sessionType: 'Screen',
                outputDevice: 'Desktop',
                appVersion: '2026.4.24',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                source: 'ResolvedSessionName',
                payload: {
                    userId: 'U-authority',
                    onlineStatus: 'online',
                    locationName: 'Resolved World',
                    statusDescription: 'Resolved status',
                    currentSessionHash: '',
                    currentSessionName: 'Resolved World',
                    sessionType: 'Screen',
                    outputDevice: 'Desktop',
                    appVersion: '2026.4.24',
                    sessions: [],
                    updatedAt: Date.now(),
                    sourceEvent: 'ResolvedSessionName'
                }
            }
        ]);

        await hydratePersistedResoniteRealtimeState('test-user');

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-authority',
                name: 'Authority User',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-authority',
                    displayName: 'Authority User',
                    state: 'online',
                    status: 'active',
                    location: 'Snapshot World',
                    traveling: 'Snapshot World',
                    statusDescription: 'Snapshot status'
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'Snapshot World',
                    currentSessionHash: 'S-snapshot',
                    currentSessionName: 'Snapshot World',
                    sessionType: 'VR',
                    outputDevice: 'Standalone',
                    appVersion: '2026.5.1',
                    profile: {
                        tagline: 'Snapshot tagline',
                        description: 'Snapshot description'
                    }
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('Snapshot World');
        expect(merged[0].ref.traveling).toBe('Snapshot World');
        expect(merged[0].ref.statusDescription).toBe('Snapshot status');
        expect(merged[0].resonite.currentSessionName).toBe('Snapshot World');
        expect(merged[0].resonite.currentSessionHash).toBe('S-snapshot');
        expect(merged[0].resonite.appVersion).toBe('2026.5.1');
        expect(merged[0].resonite.outputDevice).toBe('Standalone');
        expect(merged[0].resonite.sessionType).toBe('VR');
        expect(
            merged[0].resonite.mergeTrace.realtime.currentSessionName
        ).toEqual(
            expect.objectContaining({
                winner: 'snapshot',
                reason: 'snapshot-session-authoritative',
                sourceEvent: 'ResolvedSessionName',
                selectedValue: 'Snapshot World'
            })
        );
        expect(merged[0].resonite.mergeTrace.realtime.appVersion).toEqual(
            expect.objectContaining({
                winner: 'snapshot',
                reason: 'snapshot-status-authoritative',
                sourceEvent: 'ResolvedSessionName',
                selectedValue: '2026.5.1'
            })
        );
    });

    test('persists realtime session cache into database session rows', async () => {
        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-persist',
                            userStatus: {
                                onlineStatus: 'online',
                                locationName: 'Persisted World',
                                currentSessionName: 'Persisted World',
                                currentSessionHash: 'S-persist',
                                appVersion: '2026.4.24',
                                sessions: [
                                    {
                                        sessionHash: 'S-persist',
                                        name: 'Persisted World',
                                        hostUserId: 'U-host'
                                    }
                                ]
                            }
                        }
                    ]
                };
            }

            return true;
        });

        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                sessionHash: 'S-persist',
                name: 'Persisted Session',
                hostUserId: 'U-host',
                joinedUsers: 5
            })
        });

        await ensureResoniteRealtimePresence({
            enabled: true,
            apiKey: 'U-test:session-token',
            contactUserIds: ['U-persist'],
            persistenceKey: 'test-user'
        });

        await refreshResoniteSessionByHash({
            sessionHash: 'S-persist',
            apiKey: 'U-test:session-token',
            force: true
        });

        const persisted = await persistResoniteRealtimeState('test-user');

        expect(persisted).toBe(true);
        expect(
            mockDatabase.replaceResoniteCachedPresence
        ).toHaveBeenCalledTimes(1);
        expect(mockDatabase.replaceResoniteCachedPresence).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    resoniteUserId: 'U-persist',
                    onlineStatus: 'online',
                    locationName: 'Persisted World',
                    currentSessionName: 'Persisted World',
                    source: 'InitializeStatus'
                })
            ])
        );
        expect(
            mockDatabase.replaceResoniteCachedSessions
        ).toHaveBeenCalledTimes(1);
        expect(mockDatabase.replaceResoniteCachedSessions).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    sessionHash: 'S-persist',
                    sessionName: 'Persisted Session',
                    hostUserId: 'U-host'
                })
            ])
        );
        expect(mockConfigSetObject).not.toHaveBeenCalled();
    });

    test('clears persisted realtime session rows from database', async () => {
        mockDatabase.clearResoniteCachedPresence.mockClear();
        mockDatabase.clearResoniteCachedSessions.mockClear();
        mockConfigRemove.mockClear();

        const cleared = await clearResoniteRealtimeState('test-user');

        expect(cleared).toBe(true);
        expect(mockDatabase.clearResoniteCachedPresence).toHaveBeenCalledTimes(
            1
        );
        expect(mockDatabase.clearResoniteCachedSessions).toHaveBeenCalledTimes(
            1
        );
        expect(mockConfigRemove).not.toHaveBeenCalled();
    });
});
