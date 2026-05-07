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
    clearResoniteRealtimePresenceForUser,
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

async function sha256UpperHex(value) {
    const encoded = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

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

    test('refreshResoniteSessionByHash resolves via host sessions when userId is provided', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-other',
                    sessionId: 'S-other-id',
                    name: 'Other Session',
                    hostUserId: 'U-host'
                },
                {
                    sessionHash: 'S-hash',
                    sessionId: 'S-public',
                    name: 'Soft Sea of Stars',
                    hostUserId: 'U-host',
                    sessionUsers: [{ userID: 'U-host', username: 'bokcine' }],
                    joinedUsers: 1
                }
            ])
        });

        const result = await refreshResoniteSessionByHash({
            sessionHash: 'S-hash',
            userId: 'resonite:U-host',
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

    test('refreshResoniteSessionByHash force=true bypasses host session cache', async () => {
        // First call: host has sessions but not the one we're looking for
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-other',
                    sessionId: 'S-other-id',
                    name: 'Other World',
                    hostUserId: 'U-host'
                }
            ])
        });

        const first = await refreshResoniteSessionByHash({
            sessionHash: 'S-target',
            userId: 'resonite:U-host',
            apiKey: 'U-test:session-token'
        });

        expect(first).toBeNull();
        expect(mockWebApiExecute).toHaveBeenCalledTimes(1);

        // Second call without force uses cached host sessions (still no match)
        mockWebApiExecute.mockClear();
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-target',
                    sessionId: 'S-target-id',
                    name: 'Found World',
                    hostUserId: 'U-host'
                }
            ])
        });

        const second = await refreshResoniteSessionByHash({
            sessionHash: 'S-target',
            userId: 'resonite:U-host',
            apiKey: 'U-test:session-token'
        });

        // Cache still valid - returns cached (no match)
        expect(second).toBeNull();
        expect(mockWebApiExecute).not.toHaveBeenCalled();

        // Third call with force clears cache and refetches
        const third = await refreshResoniteSessionByHash({
            sessionHash: 'S-target',
            userId: 'resonite:U-host',
            apiKey: 'U-test:session-token',
            force: true
        });

        expect(mockWebApiExecute).toHaveBeenCalledTimes(1);
        expect(third).toMatchObject({
            sessionHash: 'S-target',
            name: 'Found World'
        });
    });

    test('refreshResoniteSessionByHash caches the nested session node from wrapped payloads', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-hash',
                    sessionId: 'S-public',
                    name: 'Soft Sea of Stars',
                    hostUserId: 'U-host',
                    joinedUsers: 2,
                    sessionUsers: [
                        {
                            userID: 'U-host',
                            username: 'HostUser',
                            isPresent: true
                        },
                        {
                            userID: 'U-other',
                            username: 'OtherUser',
                            isPresent: true
                        }
                    ]
                }
            ])
        });

        const result = await refreshResoniteSessionByHash({
            sessionHash: 'S-hash',
            userId: 'resonite:U-host',
            apiKey: 'U-test:session-token',
            force: true
        });

        expect(result).toMatchObject({
            sessionId: 'S-public',
            name: 'Soft Sea of Stars',
            joinedUsers: 2,
            sessionUsers: [
                { userID: 'U-host', username: 'HostUser', isPresent: true },
                { userID: 'U-other', username: 'OtherUser', isPresent: true }
            ]
        });
        expect(getResoniteSessionByHash('S-hash')).toMatchObject({
            sessionId: 'S-public',
            name: 'Soft Sea of Stars',
            joinedUsers: 2,
            sessionUsers: [
                { userID: 'U-host', username: 'HostUser', isPresent: true },
                { userID: 'U-other', username: 'OtherUser', isPresent: true }
            ]
        });
    });

    test('refreshResoniteSessionByHash resolves via host sessions with hostUserId', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-hash',
                    sessionId: 'S-public',
                    name: 'Soft Sea of Stars',
                    hostUserId: 'U-host',
                    sessionUsers: [
                        {
                            userID: 'U-host',
                            username: 'HostUser',
                            isPresent: true
                        }
                    ]
                }
            ])
        });

        const result = await refreshResoniteSessionByHash({
            sessionHash: 'S-hash',
            userId: 'resonite:U-host',
            apiKey: 'U-test:session-token',
            force: true
        });

        expect(result).toMatchObject({
            sessionHash: 'S-hash',
            sessionId: 'S-public',
            name: 'Soft Sea of Stars'
        });
        expect(getResoniteSessionByHash('S-hash')).toMatchObject({
            sessionHash: 'S-hash',
            sessionId: 'S-public',
            name: 'Soft Sea of Stars'
        });
    });

    test('refreshResoniteSessionByHash accepts nested host-scoped session payloads', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionInfo: {
                        sessionId: 'S-public',
                        name: 'Nested Host World',
                        hostUserID: 'U-host',
                        accessLevel: 'Contacts'
                    },
                    sessionHash: 'S-hash'
                }
            ])
        });

        const result = await refreshResoniteSessionByHash({
            sessionHash: 'S-hash',
            userId: 'resonite:U-host',
            apiKey: 'U-test:session-token',
            force: true
        });

        expect(result).toMatchObject({
            sessionHash: 'S-hash',
            sessionId: 'S-public',
            name: 'Nested Host World'
        });
        expect(getResoniteSessionByHash('S-hash')).toMatchObject({
            sessionHash: 'S-hash',
            sessionId: 'S-public',
            name: 'Nested Host World'
        });
    });

    test('buildMergedPresence preserves prior session identity for sparse SignalR status updates', () => {
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
        expect(merged.locationName).toBe('Soft Sea of Stars');
        expect(merged.currentSessionName).toBe('Soft Sea of Stars');
        expect(merged.currentSessionHash).toBe('S-hash');
    });

    test('buildMergedPresence clears stale carried-forward names when a sparse status update points at a new session hash', () => {
        const merged = buildMergedPresence(
            'U-test',
            {
                userId: 'U-test',
                onlineStatus: 'online',
                currentSessionIndex: 0,
                sessions: [
                    {
                        sessionHash: 'S-new'
                    }
                ]
            },
            {
                onlineStatus: 'online',
                locationName: 'Soft Sea of Stars',
                currentSessionName: 'Soft Sea of Stars',
                currentSessionHash: 'S-old'
            },
            'ReceiveStatusUpdate'
        );

        expect(merged.onlineStatus).toBe('online');
        expect(merged.locationName).toBe('');
        expect(merged.currentSessionName).toBe('');
        expect(merged.currentSessionHash).toBe('S-new');
    });

    test('buildMergedPresence promotes nested realtime location updates and clears stale session identity when no new hash is provided', () => {
        const merged = buildMergedPresence(
            'U-test',
            {
                userId: 'U-test',
                userStatus: {
                    onlineStatus: 'online',
                    locationName: 'TSMC Zuyo Home',
                    currentSessionName: 'TSMC Zuyo Home'
                }
            },
            {
                onlineStatus: 'online',
                locationName:
                    '[FRENCH/ENGLISH] CHILL [NEW USER ARE WELCOME] GRID',
                currentSessionName:
                    '[FRENCH/ENGLISH] CHILL [NEW USER ARE WELCOME] GRID',
                currentSessionHash: 'S-old',
                sessionId: 'session-old',
                broadcastKey: 'U-test:old',
                accessLevel: 'Anyone'
            },
            'ReceiveStatusUpdate'
        );

        expect(merged.onlineStatus).toBe('online');
        expect(merged.locationName).toBe('TSMC Zuyo Home');
        expect(merged.currentSessionName).toBe('TSMC Zuyo Home');
        expect(merged.currentSessionHash).toBe('');
        expect(merged.sessionId).toBe('');
        expect(merged.broadcastKey).toBe('');
        expect(merged.accessLevel).toBe('');
    });

    test('buildMergedPresence still clears stale session fields for explicit offline status updates', () => {
        const merged = buildMergedPresence(
            'U-test',
            { userId: 'U-test', onlineStatus: 'offline' },
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

    test('ReceiveSessionUpdate clears stale private placeholders when the live update names the session', async () => {
        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-water',
                            userStatus: {
                                onlineStatus: 'online',
                                currentSessionHash: 'S-water',
                                currentSessionIndex: 0,
                                sessions: [
                                    {
                                        sessionHash: 'S-water',
                                        broadcastKey: 'U-water:messing-around',
                                        accessLevel: 'private'
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
            contactUserIds: ['U-water'],
            persistenceKey: 'test-user'
        });

        await signalRHandlers.ReceiveSessionUpdate({
            broadcastKey: 'U-water:messing-around',
            name: 'messing around'
        });

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-water',
                name: 'Water',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-water',
                    displayName: 'Water',
                    state: 'online',
                    status: 'active',
                    location: 'private',
                    traveling: 'Private',
                    statusDescription: '',
                    resonite: {
                        locationName: 'Private',
                        currentSessionName: 'Private',
                        currentSessionHash: 'S-water',
                        accessLevel: 'private'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'Private',
                    currentSessionName: 'Private',
                    currentSessionHash: 'S-water',
                    accessLevel: 'private'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('messing around');
        expect(merged[0].ref.traveling).toBe('messing around');
        expect(merged[0].resonite.locationName).toBe('messing around');
        expect(merged[0].resonite.currentSessionName).toBe('messing around');
        expect(merged[0].resonite.broadcastKey).toBe('U-water:messing-around');
        expect(merged[0].resonite.accessLevel).toBe('');
    });

    test('ReceiveSessionUpdate refreshes cached session details by broadcast key for the current hash', async () => {
        mockWebApiExecute.mockImplementation(async ({ url }) => {
            if (url.endsWith('/sessions/S-water')) {
                return {
                    status: 404,
                    data: ''
                };
            }

            if (
                url.includes('hostUserId=U-water') ||
                url.includes('includeEnded=true')
            ) {
                return {
                    status: 200,
                    data: JSON.stringify([])
                };
            }

            if (url.includes('includeEnded=false')) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionId: 'session-water',
                            broadcastKey: 'U-water:messing-around',
                            accessLevel: 'RegisteredUsers',
                            name: 'messing around',
                            sessionUsers: [
                                {
                                    userID: 'U-water',
                                    username: 'Water'
                                },
                                {
                                    userID: 'U-vilhelm',
                                    username: 'Vilhelm'
                                }
                            ]
                        }
                    ])
                };
            }

            return {
                status: 200,
                data: JSON.stringify([])
            };
        });

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-water',
                            userStatus: {
                                onlineStatus: 'online',
                                currentSessionHash: 'S-water',
                                currentSessionIndex: 0,
                                sessions: [
                                    {
                                        sessionHash: 'S-water',
                                        broadcastKey: 'U-water:messing-around',
                                        accessLevel: 'private'
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
            contactUserIds: ['U-water'],
            persistenceKey: 'test-user'
        });

        await signalRHandlers.ReceiveSessionUpdate({
            broadcastKey: 'U-water:messing-around',
            name: 'messing around'
        });

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(getResoniteSessionByHash('S-water')).toMatchObject({
            sessionId: 'session-water',
            broadcastKey: 'U-water:messing-around',
            accessLevel: 'RegisteredUsers',
            name: 'messing around',
            sessionUsers: [
                expect.objectContaining({
                    userID: 'U-water',
                    username: 'Water'
                }),
                expect.objectContaining({
                    userID: 'U-vilhelm',
                    username: 'Vilhelm'
                })
            ]
        });
    });

    test('ReceiveSessionUpdate preserves richer cached session metadata when the live update is sparse', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([
                {
                    sessionHash: 'S-rich',
                    sessionId: 'session-stable-123',
                    name: 'Soft Sea of Stars',
                    broadcastKey: 'U-bokcine:shared-world',
                    accessLevel: 'RegisteredUsers',
                    hostUserId: 'U-bokcine',
                    sessionUsers: [
                        {
                            userID: 'U-bokcine',
                            username: 'bokcine'
                        },
                        {
                            userID: 'U-vilhelm',
                            username: 'Vilhelm'
                        }
                    ]
                }
            ])
        });

        await refreshResoniteSessionByHash({
            sessionHash: 'S-rich',
            userId: 'resonite:U-bokcine',
            apiKey: 'U-test:session-token',
            force: true
        });

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-bokcine',
                            userStatus: {
                                onlineStatus: 'online',
                                locationName: 'Soft Sea of Stars',
                                currentSessionName: 'Soft Sea of Stars',
                                currentSessionIndex: 0,
                                sessions: [
                                    {
                                        sessionHash: 'S-rich',
                                        broadcastKey: 'U-bokcine:shared-world',
                                        accessLevel: 'RegisteredUsers'
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
            broadcastKey: 'U-bokcine:shared-world',
            name: 'Cherry blossom cozy\n-벚꽃 쉼터-'
        });

        expect(getResoniteSessionByHash('S-rich')).toMatchObject({
            sessionHash: 'S-rich',
            sessionId: 'session-stable-123',
            broadcastKey: 'U-bokcine:shared-world',
            accessLevel: 'RegisteredUsers',
            sessionUsers: [
                expect.objectContaining({
                    userID: 'U-bokcine',
                    username: 'bokcine'
                }),
                expect.objectContaining({
                    userID: 'U-vilhelm',
                    username: 'Vilhelm'
                })
            ],
            name: 'Cherry blossom cozy\n-벚꽃 쉼터-'
        });
    });

    test('hydrates all concurrent session hashes from realtime presence instead of only the current session', async () => {
        mockWebApiExecute.mockImplementation(async ({ url }) => {
            if (url.includes('hostId=U-multi')) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionHash: 'S-primary',
                            sessionId: 'S-primary-id',
                            name: 'Primary World',
                            accessLevel: 'RegisteredUsers',
                            hostUserId: 'U-multi'
                        },
                        {
                            sessionHash: 'S-secondary',
                            sessionId: 'S-secondary-id',
                            name: 'Secondary World',
                            accessLevel: 'Anyone',
                            hostUserId: 'U-multi'
                        }
                    ])
                };
            }

            return { status: 200, data: JSON.stringify([]) };
        });

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-multi',
                            userStatus: {
                                onlineStatus: 'online',
                                currentSessionHash: 'S-primary',
                                currentSessionIndex: 0,
                                hashSalt: 'test-salt',
                                sessions: [
                                    {
                                        sessionHash: 'S-primary',
                                        broadcastKey: 'U-multi:primary'
                                    },
                                    {
                                        sessionHash: 'S-secondary',
                                        broadcastKey: 'U-multi:secondary'
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
            contactUserIds: ['U-multi'],
            persistenceKey: 'test-user'
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(getResoniteSessionByHash('S-primary')).toMatchObject({
            sessionHash: 'S-primary',
            name: 'Primary World'
        });
        expect(getResoniteSessionByHash('S-secondary')).toMatchObject({
            sessionHash: 'S-secondary',
            name: 'Secondary World'
        });
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

    test('resolved public session names overwrite synthetic private placeholders', async () => {
        mockWebApiExecute.mockImplementation(async ({ url }) => {
            // Return as visible sessions list
            if (url.includes('/sessions')) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionId: 'S-public-id',
                            sessionHash: 'S-public',
                            name: 'Cherry blossom cozy -벚꽃 쉼터-',
                            accessLevel: 'anyone',
                            hostUserId: 'U-element'
                        }
                    ])
                };
            }
            return { status: 404, data: '' };
        });

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-element',
                            userStatus: {
                                onlineStatus: 'online',
                                currentSessionHash: 'S-public',
                                currentSessionIndex: 0,
                                hashSalt: 'test-salt',
                                sessions: [
                                    {
                                        accessLevel: 'private',
                                        sessionHash: 'S-public'
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
            contactUserIds: ['U-element'],
            persistenceKey: 'test-user'
        });

        await Promise.resolve();
        await Promise.resolve();

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-element',
                name: 'Element',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-element',
                    displayName: 'Element',
                    state: 'online',
                    status: 'active',
                    location: 'private',
                    traveling: 'Private',
                    statusDescription: '',
                    resonite: {
                        locationName: 'Private',
                        currentSessionName: 'Private',
                        currentSessionHash: 'S-public',
                        accessLevel: 'private'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'Private',
                    currentSessionName: 'Private',
                    currentSessionHash: 'S-public',
                    accessLevel: 'private'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(getResoniteSessionByHash('S-public')).toMatchObject({
            sessionHash: 'S-public',
            name: 'Cherry blossom cozy -벚꽃 쉼터-',
            accessLevel: 'anyone'
        });
        expect(merged[0].ref.location).toBe(
            'Cherry blossom cozy -벚꽃 쉼터- - Public'
        );
        expect(merged[0].ref.traveling).toBe(
            'Cherry blossom cozy -벚꽃 쉼터- - Public'
        );
        expect(merged[0].resonite.locationName).toBe(
            'Cherry blossom cozy -벚꽃 쉼터- - Public'
        );
        expect(merged[0].resonite.currentSessionName).toBe(
            'Cherry blossom cozy -벚꽃 쉼터- - Public'
        );
        expect(merged[0].resonite.accessLevel).toBe('anyone');
    });

    test('realtime-enriched contacts become presence-authoritative even when the snapshot source is contacts-only', async () => {
        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-contacts-only',
                            userStatus: {
                                onlineStatus: 'online',
                                locationName: 'Realtime World',
                                currentSessionName: 'Realtime World',
                                currentSessionHash: 'S-realtime',
                                currentSessionIndex: 0,
                                sessions: [
                                    {
                                        sessionHash: 'S-realtime'
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
            contactUserIds: ['U-contacts-only'],
            persistenceKey: 'test-user'
        });

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-contacts-only',
                name: 'Contacts Only User',
                state: 'offline',
                status: '',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-contacts-only',
                    displayName: 'Contacts Only User',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: '',
                    statusDescription: '',
                    resonite: {
                        hasPresenceSignals: false,
                        locationName: '',
                        currentSessionName: '',
                        currentSessionHash: ''
                    }
                },
                resonite: {
                    userId: 'U-contacts-only',
                    hasPresenceSignals: false,
                    locationName: '',
                    currentSessionName: '',
                    currentSessionHash: ''
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].state).toBe('online');
        expect(merged[0].ref.location).toBe('Realtime World');
        expect(merged[0].resonite.currentSessionHash).toBe('S-realtime');
        expect(merged[0].resonite.currentSessionName).toBe('Realtime World');
        expect(merged[0].resonite.hasPresenceSignals).toBe(true);
        expect(merged[0].ref.resonite.hasPresenceSignals).toBe(true);
    });

    test('host session lookup ignores generic hostless session payloads', async () => {
        const targetHash = await sha256UpperHex('room-1salt-123');

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-hostlookup',
                            userStatus: {
                                onlineStatus: 'online',
                                currentSessionHash: targetHash,
                                currentSessionIndex: 0,
                                hashSalt: 'salt-123',
                                sessions: [
                                    {
                                        accessLevel: 'private',
                                        sessionHash: targetHash
                                    }
                                ]
                            }
                        }
                    ]
                };
            }

            return true;
        });

        mockWebApiExecute.mockImplementation(async ({ url }) => {
            if (url.includes('hostId=U-hostlookup')) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionId: 'room-1',
                            name: 'Wrong Hostless World'
                        }
                    ])
                };
            }

            if (url.includes('hostUserId=U-hostlookup')) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionId: 'room-1',
                            name: 'Wrong Hostless World'
                        }
                    ])
                };
            }

            if (
                url.includes(
                    '/sessions?includeEmptyHeadless=true&includeEnded=false&minActiveUsers=0'
                )
            ) {
                return {
                    status: 200,
                    data: JSON.stringify([])
                };
            }

            if (
                url.includes(
                    '/sessions?includeEmptyHeadless=true&includeEnded=true&minActiveUsers=0'
                )
            ) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionId: 'room-1',
                            name: 'Wrong Hostless World'
                        }
                    ])
                };
            }

            if (url.includes(`/sessions/${targetHash}`)) {
                return {
                    status: 404,
                    data: ''
                };
            }

            return {
                status: 404,
                data: ''
            };
        });

        await ensureResoniteRealtimePresence({
            enabled: true,
            apiKey: 'U-test:session-token',
            contactUserIds: ['U-hostlookup'],
            persistenceKey: 'test-user'
        });

        await Promise.resolve();
        await Promise.resolve();

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-hostlookup',
                name: 'Host Lookup User',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-hostlookup',
                    displayName: 'Host Lookup User',
                    state: 'online',
                    status: 'active',
                    location: 'Private',
                    traveling: 'Private',
                    statusDescription: '',
                    resonite: {
                        locationName: 'Private',
                        currentSessionName: 'Private',
                        currentSessionHash: targetHash,
                        hashSalt: 'salt-123',
                        accessLevel: 'private'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'Private',
                    currentSessionName: 'Private',
                    currentSessionHash: targetHash,
                    hashSalt: 'salt-123',
                    accessLevel: 'private'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('Private');
        expect(merged[0].ref.traveling).toBe('Private');
        expect(merged[0].resonite.currentSessionName).toBe('Private');
        expect(getResoniteSessionByHash(targetHash)).toBeNull();
    });

    test('visible session lookup resolves nested sessionInfo payloads', async () => {
        const targetHash = await sha256UpperHex('room-2salt-456');

        mockSignalRInvoke.mockImplementation(async (methodName) => {
            if (methodName === 'InitializeStatus') {
                return {
                    contacts: [
                        {
                            id: 'U-visible-nested',
                            userStatus: {
                                onlineStatus: 'online',
                                currentSessionHash: targetHash,
                                currentSessionIndex: 0,
                                hashSalt: 'salt-456',
                                sessions: [
                                    {
                                        accessLevel: 'contacts',
                                        sessionHash: targetHash,
                                        isHost: false
                                    }
                                ]
                            }
                        }
                    ]
                };
            }

            return true;
        });

        mockWebApiExecute.mockImplementation(async ({ url }) => {
            if (url.includes('hostId=U-visible-nested')) {
                return {
                    status: 200,
                    data: JSON.stringify([])
                };
            }

            if (url.includes('hostUserId=U-visible-nested')) {
                return {
                    status: 200,
                    data: JSON.stringify([])
                };
            }

            if (
                url.includes(
                    '/sessions?includeEmptyHeadless=true&includeEnded=false&minActiveUsers=0'
                )
            ) {
                return {
                    status: 200,
                    data: JSON.stringify([
                        {
                            sessionInfo: {
                                sessionId: 'room-2',
                                name: 'Nested Visible World',
                                accessLevel: 'Contacts'
                            }
                        }
                    ])
                };
            }

            if (url.includes(`/sessions/${targetHash}`)) {
                return {
                    status: 404,
                    data: ''
                };
            }

            return {
                status: 404,
                data: ''
            };
        });

        await ensureResoniteRealtimePresence({
            enabled: true,
            apiKey: 'U-test:session-token',
            contactUserIds: ['U-visible-nested'],
            persistenceKey: 'test-user'
        });

        for (let attempt = 0; attempt < 8; attempt += 1) {
            if (getResoniteSessionByHash(targetHash)) {
                break;
            }

            await new Promise((r) => setTimeout(r, 0));
        }

        const friendSnapshot = {
            id: 'resonite:U-visible-nested',
            name: 'Visible Nested User',
            state: 'online',
            status: 'active',
            provider: 'resonite',
            isExternal: true,
            ref: {
                id: 'resonite:U-visible-nested',
                displayName: 'Visible Nested User',
                state: 'online',
                status: 'active',
                location: 'Private',
                traveling: 'Private',
                statusDescription: '',
                resonite: {
                    locationName: '',
                    currentSessionName: '',
                    currentSessionHash: targetHash,
                    hashSalt: 'salt-456',
                    accessLevel: 'contacts'
                }
            },
            resonite: {
                onlineStatus: 'online',
                locationName: '',
                currentSessionName: '',
                currentSessionHash: targetHash,
                hashSalt: 'salt-456',
                accessLevel: 'contacts'
            }
        };

        let merged = mergeResoniteRealtimePresence([friendSnapshot]);
        for (let attempt = 0; attempt < 8; attempt += 1) {
            if (
                merged[0]?.resonite?.currentSessionName ===
                'Nested Visible World - Contacts only'
            ) {
                break;
            }

            await new Promise((r) => setTimeout(r, 0));
            merged = mergeResoniteRealtimePresence([friendSnapshot]);
        }

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe(
            'Nested Visible World - Contacts only'
        );
        expect(merged[0].ref.traveling).toBe(
            'Nested Visible World - Contacts only'
        );
        expect(merged[0].resonite.currentSessionName).toBe(
            'Nested Visible World - Contacts only'
        );
        expect(getResoniteSessionByHash(targetHash)).toMatchObject({
            sessionId: 'room-2',
            name: 'Nested Visible World'
        });
    });

    test('mergeResoniteRealtimePresence promotes a resolved secondary session target when the current hash is stale', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-secondary-target',
                onlineStatus: 'online',
                locationName: 'Private',
                currentSessionHash: 'S-stale-current',
                currentSessionName: 'Private',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                source: 'ResolvedSessionName',
                payload: {
                    userId: 'U-secondary-target',
                    onlineStatus: 'online',
                    locationName: 'Private',
                    currentSessionHash: 'S-stale-current',
                    currentSessionName: 'Private',
                    accessLevel: 'registeredusers',
                    sessionId: 'session-stable-123',
                    sessions: [
                        {
                            sessionHash: 'S-stale-current',
                            accessLevel: 'registeredusers'
                        },
                        {
                            sessionHash: 'S-resolved-secondary',
                            sessionId: 'session-stable-123',
                            accessLevel: 'registeredusers'
                        }
                    ],
                    updatedAt: Date.now(),
                    sourceEvent: 'ResolvedSessionName'
                }
            }
        ]);
        mockDatabase.getResoniteCachedSessions.mockResolvedValue([
            {
                sessionHash: 'S-resolved-secondary',
                sessionName: 'Shared World',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                payload: {
                    sessionHash: 'S-resolved-secondary',
                    sessionId: 'session-stable-123',
                    name: 'Shared World',
                    accessLevel: 'registeredusers'
                }
            }
        ]);

        await hydratePersistedResoniteRealtimeState('test-user');

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-secondary-target',
                name: 'Secondary Target User',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-secondary-target',
                    displayName: 'Secondary Target User',
                    state: 'online',
                    status: 'active',
                    location: 'Private',
                    traveling: 'Private',
                    resonite: {
                        currentSessionHash: 'S-stale-current',
                        currentSessionName: 'Private',
                        locationName: 'Private',
                        accessLevel: 'registeredusers'
                    }
                },
                resonite: {
                    onlineStatus: 'online',
                    currentSessionHash: 'S-stale-current',
                    currentSessionName: 'Private',
                    locationName: 'Private',
                    accessLevel: 'registeredusers'
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('Shared World');
        expect(merged[0].ref.traveling).toBe('Shared World');
        expect(merged[0].resonite.currentSessionName).toBe('Shared World');
        expect(merged[0].resonite.locationName).toBe('Shared World');
        expect(merged[0].resonite.accessLevel).toBe('registeredusers');
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

    test('buildMergedPresence treats hidden sessions as Private even when access level is not literal private', () => {
        const merged = buildMergedPresence(
            'U-hidden',
            {
                userStatus: {
                    onlineStatus: 'sociable',
                    currentSessionIndex: 1,
                    sessions: [
                        {
                            accessLevel: 'Private',
                            sessionHash: 'S-other-private',
                            sessionHidden: false
                        },
                        {
                            accessLevel: 'RegisteredUsers',
                            sessionHash: 'S-hidden-current',
                            sessionHidden: true
                        }
                    ]
                },
                outputDevice: 'Screen',
                sessionType: 'GraphicalClient',
                appVersion: '2026.4.23.1269'
            },
            {
                userId: 'U-hidden',
                onlineStatus: 'online',
                locationName: 'Old World',
                currentSessionName: 'Old World',
                currentSessionHash: 'S-old'
            },
            'ReceiveStatusUpdate'
        );

        expect(merged.locationName).toBe('Private');
        expect(merged.currentSessionName).toBe('Private');
        expect(merged.currentSessionHash).toBe('S-hidden-current');
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

    test('skips persisted realtime presence and session rows older than ten minutes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-07T20:00:00.000Z'));

        try {
            const observedAt = Date.now() - 11 * 60_000;

            mockDatabase.getResoniteCachedPresence.mockResolvedValue([
                {
                    resoniteUserId: 'U-stale-db-presence',
                    onlineStatus: 'online',
                    locationName: 'Stale Database World',
                    currentSessionHash: 'S-stale-db-presence',
                    currentSessionName: 'Stale Database World',
                    observedAt,
                    expiresAt: 0,
                    source: 'InitializeStatus',
                    payload: {
                        userId: 'U-stale-db-presence',
                        onlineStatus: 'online',
                        locationName: 'Stale Database World',
                        currentSessionHash: 'S-stale-db-presence',
                        currentSessionName: 'Stale Database World',
                        sessions: [],
                        updatedAt: observedAt,
                        sourceEvent: 'InitializeStatus'
                    }
                }
            ]);
            mockDatabase.getResoniteCachedSessions.mockResolvedValue([
                {
                    sessionHash: 'S-stale-db',
                    sessionName: 'Stale Database Session',
                    observedAt,
                    expiresAt: 0,
                    payload: {
                        sessionHash: 'S-stale-db',
                        name: 'Stale Database Session',
                        joinedUsers: 3
                    }
                }
            ]);

            const hydrated =
                await hydratePersistedResoniteRealtimeState('test-user');

            expect(hydrated).toBe(false);
            expect(getResoniteSessionByHash('S-stale-db')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
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

    test('contacts-only offline snapshots do not prune active realtime presence before merge', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-contacts-only',
                onlineStatus: 'online',
                locationName: 'Soft Sea of Stars',
                currentSessionHash: 'S-live',
                currentSessionName: 'Soft Sea of Stars',
                observedAt: 100,
                expiresAt: Date.now() + 60_000,
                source: 'ReceiveSessionUpdate',
                payload: {
                    userId: 'U-contacts-only',
                    onlineStatus: 'online',
                    locationName: 'Soft Sea of Stars',
                    currentSessionHash: 'S-live',
                    currentSessionName: 'Soft Sea of Stars',
                    sessions: [],
                    updatedAt: 100,
                    sourceEvent: 'ReceiveSessionUpdate'
                }
            }
        ]);

        await hydratePersistedResoniteRealtimeState('test-user');

        const contactsOnlySnapshot = [
            {
                id: 'resonite:U-contacts-only',
                name: 'Contacts Only User',
                state: 'offline',
                status: '',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-contacts-only',
                    displayName: 'Contacts Only User',
                    state: 'offline',
                    location: 'offline',
                    traveling: '',
                    resonite: {
                        hasPresenceSignals: false,
                        contactObservedAt: 200
                    }
                },
                resonite: {
                    hasPresenceSignals: false,
                    onlineStatus: '',
                    contactObservedAt: 200,
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            }
        ];

        expect(
            reconcileResoniteRealtimeAgainstSnapshot(contactsOnlySnapshot)
        ).toBe(0);

        const merged = mergeResoniteRealtimePresence(contactsOnlySnapshot);
        expect(merged[0].state).toBe('online');
        expect(merged[0].ref.location).toBe('Soft Sea of Stars');
        expect(merged[0].resonite.currentSessionHash).toBe('S-live');
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

    test('newer snapshot session fields outrank stale realtime session identity during merge', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-session-shift',
                onlineStatus: 'online',
                locationName: 'Old World',
                currentSessionHash: 'S-old',
                currentSessionName: 'Old World',
                observedAt: 100,
                expiresAt: Date.now() + 60_000,
                source: 'ReceiveSessionUpdate',
                payload: {
                    userId: 'U-session-shift',
                    onlineStatus: 'online',
                    locationName: 'Old World',
                    currentSessionHash: 'S-old',
                    currentSessionName: 'Old World',
                    sessions: [],
                    updatedAt: 100,
                    sourceEvent: 'ReceiveSessionUpdate'
                }
            }
        ]);

        await hydratePersistedResoniteRealtimeState('test-user');

        const merged = mergeResoniteRealtimePresence([
            {
                id: 'resonite:U-session-shift',
                name: 'Session Shift User',
                state: 'online',
                status: 'active',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-session-shift',
                    displayName: 'Session Shift User',
                    state: 'online',
                    status: 'active',
                    location: 'Private',
                    traveling: 'Private',
                    statusDescription: ''
                },
                resonite: {
                    onlineStatus: 'online',
                    locationName: 'Private',
                    currentSessionHash: 'S-new',
                    currentSessionName: 'Private',
                    accessLevel: 'private',
                    contactObservedAt: 200
                }
            }
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].ref.location).toBe('Private');
        expect(merged[0].ref.traveling).toBe('Private');
        expect(merged[0].resonite.locationName).toBe('Private');
        expect(merged[0].resonite.currentSessionHash).toBe('S-new');
        expect(merged[0].resonite.currentSessionName).toBe('Private');
        expect(merged[0].resonite.accessLevel).toBe('private');
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
                                currentSessionIndex: 0,
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
            data: JSON.stringify([
                {
                    sessionHash: 'S-persist',
                    sessionId: 'S-persist-id',
                    name: 'Persisted Session',
                    hostUserId: 'U-host',
                    joinedUsers: 5
                }
            ])
        });

        await ensureResoniteRealtimePresence({
            enabled: true,
            apiKey: 'U-test:session-token',
            contactUserIds: ['U-persist'],
            persistenceKey: 'test-user'
        });

        await refreshResoniteSessionByHash({
            sessionHash: 'S-persist',
            userId: 'resonite:U-host',
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

    test('clears a definitive offline user from persisted realtime presence immediately', async () => {
        mockDatabase.getResoniteCachedPresence.mockResolvedValue([
            {
                resoniteUserId: 'U-stale-offline',
                onlineStatus: 'online',
                locationName: 'Persisted World',
                currentSessionHash: 'S-stale-offline',
                currentSessionName: 'Persisted World',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                source: 'ReceiveStatusUpdate',
                payload: {
                    userId: 'U-stale-offline',
                    onlineStatus: 'online',
                    locationName: 'Persisted World',
                    currentSessionHash: 'S-stale-offline',
                    currentSessionName: 'Persisted World',
                    sessions: [],
                    updatedAt: Date.now(),
                    sourceEvent: 'ReceiveStatusUpdate'
                }
            },
            {
                resoniteUserId: 'U-keep',
                onlineStatus: 'online',
                locationName: 'Keep World',
                currentSessionHash: 'S-keep',
                currentSessionName: 'Keep World',
                observedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
                source: 'InitializeStatus',
                payload: {
                    userId: 'U-keep',
                    onlineStatus: 'online',
                    locationName: 'Keep World',
                    currentSessionHash: 'S-keep',
                    currentSessionName: 'Keep World',
                    sessions: [],
                    updatedAt: Date.now(),
                    sourceEvent: 'InitializeStatus'
                }
            }
        ]);

        await hydratePersistedResoniteRealtimeState('test-user');

        const cleared = await clearResoniteRealtimePresenceForUser(
            'U-stale-offline',
            { persistImmediately: true }
        );

        expect(cleared).toBe(true);
        expect(mockDatabase.replaceResoniteCachedPresence).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    resoniteUserId: 'U-keep',
                    onlineStatus: 'online',
                    locationName: 'Keep World'
                })
            ]
        );
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
