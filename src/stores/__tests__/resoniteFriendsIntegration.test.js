import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock the resoniteFriends service
const {
    mockFetchResoniteFriends,
    mockMergeResoniteUserProfile,
    mockConfigRepository,
    mockDatabase,
    mockFriendGetStatus,
    mockProcessBulk,
    mockRequest,
    mockFavoriteGetFavoriteLimits,
    mockFavoriteGetFavorites,
    mockFavoriteGetFavoriteGroups,
    mockWorldGetWorlds,
    mockAvatarGetAvatars,
    mockPlayerModerationGetPlayerModerations,
    mockNotificationGetNotifications,
    mockQueryFetch,
    mockHydratePersistedResoniteRealtimeState,
    mockEnsureResoniteRealtimePresence,
    mockMergeResoniteRealtimePresence,
    mockReconcileResoniteRealtimeAgainstSnapshot,
    mockGetResoniteSessionByHash,
    mockSetResoniteRealtimePresenceListener,
    mockStopResoniteRealtimePresence,
    mockClearResoniteRealtimeState,
    mockRouter
} = vi.hoisted(() => ({
    mockFetchResoniteFriends: vi.fn(),
    mockMergeResoniteUserProfile: vi.fn((friend, userPayload) => ({
        ...friend,
        ref: {
            ...(friend?.ref || {}),
            profileImageUrl: userPayload?.profile?.iconUrl || '',
            userIcon: userPayload?.profile?.iconUrl || ''
        },
        resonite: {
            ...(friend?.resonite || {}),
            username: userPayload?.username || friend?.resonite?.username || '',
            registrationDate:
                userPayload?.registrationDate ||
                friend?.resonite?.registrationDate ||
                '',
            isVerified: userPayload?.isVerified ?? friend?.resonite?.isVerified,
            profile: {
                ...(friend?.resonite?.profile || {}),
                ...(userPayload?.profile || {})
            }
        }
    })),
    mockConfigRepository: {
        getString: vi.fn(),
        setString: vi.fn(),
        getBool: vi.fn(),
        setBool: vi.fn(),
        getInt: vi.fn(),
        setInt: vi.fn(),
        getObject: vi.fn(),
        setObject: vi.fn(),
        getFloat: vi.fn(),
        setFloat: vi.fn(),
        remove: vi.fn()
    },
    mockFriendGetStatus: vi.fn(),
    mockProcessBulk: vi.fn(),
    mockRequest: vi.fn(),
    mockFavoriteGetFavoriteLimits: vi.fn(),
    mockFavoriteGetFavorites: vi.fn(),
    mockFavoriteGetFavoriteGroups: vi.fn(),
    mockWorldGetWorlds: vi.fn(),
    mockAvatarGetAvatars: vi.fn(),
    mockPlayerModerationGetPlayerModerations: vi.fn(),
    mockNotificationGetNotifications: vi.fn(),
    mockQueryFetch: vi.fn(),
    mockDatabase: /** @type {any} */ (
        new Proxy(
            {},
            {
                get: (_target, property) => {
                    if (property === '__esModule') {
                        return false;
                    }

                    if (!(property in _target)) {
                        _target[property] = vi.fn(async () => []);
                    }

                    return _target[property];
                }
            }
        )
    ),
    mockHydratePersistedResoniteRealtimeState: vi.fn(),
    mockEnsureResoniteRealtimePresence: vi.fn(),
    mockMergeResoniteRealtimePresence: vi.fn(),
    mockReconcileResoniteRealtimeAgainstSnapshot: vi.fn(),
    mockGetResoniteSessionByHash: vi.fn(),
    mockSetResoniteRealtimePresenceListener: vi.fn(),
    mockStopResoniteRealtimePresence: vi.fn(),
    mockClearResoniteRealtimeState: vi.fn(),
    mockRouter: {
        currentRoute: {
            __v_isRef: true,
            value: {
                name: ''
            }
        },
        beforeEach: vi.fn(),
        afterEach: vi.fn(),
        push: vi.fn(),
        replace: vi.fn()
    }
}));

vi.mock('../../services/resoniteFriends', () => ({
    fetchResoniteFriends: (...args) => mockFetchResoniteFriends(...args),
    mergeResoniteUserProfile: (friend, userPayload) =>
        mockMergeResoniteUserProfile(friend, userPayload)
}));

vi.mock('../../services/config', () => ({
    default: mockConfigRepository
}));

vi.mock('../../services/request', async (importOriginal) => {
    const actual = /** @type {any} */ (await importOriginal());
    return {
        ...actual,
        request: (...args) => mockRequest(...args),
        processBulk: (...args) => mockProcessBulk(...args)
    };
});

vi.mock('../../services/websocket', async (importOriginal) => {
    const actual = /** @type {any} */ (await importOriginal());
    return {
        ...actual,
        initWebsocket: vi.fn()
    };
});

vi.mock('../../services/database', () => ({
    database: mockDatabase,
    dbVars: {}
}));

vi.mock('../../api', async (importOriginal) => {
    const actual = /** @type {any} */ (await importOriginal());
    return {
        ...actual,
        favoriteRequest: {
            ...actual.favoriteRequest,
            getFavoriteLimits: (...args) =>
                mockFavoriteGetFavoriteLimits(...args),
            getFavorites: (...args) => mockFavoriteGetFavorites(...args),
            getFavoriteGroups: (...args) =>
                mockFavoriteGetFavoriteGroups(...args)
        },
        friendRequest: {
            ...actual.friendRequest,
            getFriendStatus: (...args) => mockFriendGetStatus(...args)
        },
        avatarRequest: {
            ...actual.avatarRequest,
            getAvatars: (...args) => mockAvatarGetAvatars(...args)
        },
        worldRequest: {
            ...actual.worldRequest,
            getWorlds: (...args) => mockWorldGetWorlds(...args)
        },
        playerModerationRequest: {
            ...actual.playerModerationRequest,
            getPlayerModerations: (...args) =>
                mockPlayerModerationGetPlayerModerations(...args)
        },
        notificationRequest: {
            ...actual.notificationRequest,
            getNotifications: (...args) =>
                mockNotificationGetNotifications(...args)
        },
        queryRequest: {
            ...actual.queryRequest,
            fetch: (...args) => mockQueryFetch(...args)
        },
        userRequest: {
            ...actual.userRequest,
            getUser: vi.fn()
        }
    };
});

vi.mock('../../services/resoniteRealtime', () => ({
    hydratePersistedResoniteRealtimeState: (...args) =>
        mockHydratePersistedResoniteRealtimeState(...args),
    ensureResoniteRealtimePresence: (...args) =>
        mockEnsureResoniteRealtimePresence(...args),
    mergeResoniteRealtimePresence: (...args) =>
        mockMergeResoniteRealtimePresence(...args),
    reconcileResoniteRealtimeAgainstSnapshot: (...args) =>
        mockReconcileResoniteRealtimeAgainstSnapshot(...args),
    getResoniteSessionByHash: (...args) =>
        mockGetResoniteSessionByHash(...args),
    setResoniteRealtimePresenceListener: (...args) =>
        mockSetResoniteRealtimePresenceListener(...args),
    stopResoniteRealtimePresence: (...args) =>
        mockStopResoniteRealtimePresence(...args),
    clearResoniteRealtimeState: (...args) =>
        mockClearResoniteRealtimeState(...args)
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key) => key,
        locale: { value: 'en' }
    }),
    createI18n: () => ({
        global: {
            t: (key) => key,
            locale: { value: 'en' },
            setLocaleMessage: vi.fn()
        }
    })
}));

vi.mock('vue-router', () => ({
    createRouter: () => mockRouter,
    createWebHashHistory: () => ({}),
    useRouter: () => mockRouter,
    useRoute: () => mockRouter.currentRoute.value,
    RouterLink: {},
    RouterView: {}
}));

vi.mock('../../plugins/i18n', () => ({
    i18n: {
        global: {
            t: (key) => key
        }
    }
}));

vi.mock('@/plugins', () => ({
    i18n: {
        global: {
            t: (key) => key
        }
    },
    loadLocalizedStrings: vi.fn(async () => undefined)
}));

import { useFriendStore } from '../friend';
import { useAdvancedSettingsStore } from '../settings/advanced';
import { useUserStore } from '../user';
import { watchState } from '../../services/watchState';
import { runPendingOfflineTickFlow } from '../../coordinators/friendPresenceCoordinator';
import { runUpdateFriendshipsFlow } from '../../coordinators/friendRelationshipCoordinator';

describe('friend store - Resonite integration', () => {
    beforeEach(async () => {
        setActivePinia(createPinia());
        vi.clearAllMocks();

        mockConfigRepository.getString.mockImplementation(
            async (_key, defaultValue = null) => defaultValue
        );
        mockMergeResoniteUserProfile.mockClear();
        mockConfigRepository.setString.mockResolvedValue(undefined);
        mockConfigRepository.getBool.mockImplementation(
            async (_key, defaultValue = null) => defaultValue
        );
        mockConfigRepository.setBool.mockResolvedValue(undefined);
        mockConfigRepository.getInt.mockImplementation(
            async (_key, defaultValue = null) => defaultValue
        );
        mockConfigRepository.setInt.mockResolvedValue(undefined);
        mockConfigRepository.getObject.mockImplementation(
            async (_key, defaultValue = null) => defaultValue
        );
        mockConfigRepository.setObject.mockResolvedValue(undefined);
        mockConfigRepository.getFloat.mockImplementation(
            async (_key, defaultValue = null) => defaultValue
        );
        mockConfigRepository.setFloat.mockResolvedValue(undefined);
        mockConfigRepository.remove.mockResolvedValue(undefined);
        mockFriendGetStatus.mockResolvedValue({
            json: {
                isFriend: false,
                incomingRequest: false,
                outgoingRequest: false
            },
            params: {
                userId: 'usr_test',
                currentUserId: 'usr_test'
            }
        });
        mockRequest.mockImplementation(async (endpoint) => {
            switch (endpoint) {
                case 'auth/user/favoritelimits':
                    return {};
                case 'favorites':
                case 'favorite/groups':
                case 'worlds':
                case 'avatars':
                case 'auth/user/playermoderations':
                case 'auth/user/avatarmoderations':
                case 'auth/user/notifications':
                case 'users/usr_test/groups':
                    return [];
                default:
                    return [];
            }
        });
        mockProcessBulk.mockImplementation(
            async ({ fn, params = {}, handle, done }) => {
                const result = await fn(params);
                if (handle) {
                    handle(result);
                }
                if (done) {
                    done();
                }
                return result;
            }
        );
        mockFavoriteGetFavoriteLimits.mockResolvedValue({
            json: {}
        });
        mockFavoriteGetFavorites.mockResolvedValue({
            json: [],
            params: {}
        });
        mockFavoriteGetFavoriteGroups.mockResolvedValue({
            json: [],
            params: {}
        });
        mockWorldGetWorlds.mockResolvedValue({
            json: [],
            params: {}
        });
        mockAvatarGetAvatars.mockResolvedValue({
            json: [],
            params: {}
        });
        mockPlayerModerationGetPlayerModerations.mockResolvedValue({
            json: []
        });
        mockNotificationGetNotifications.mockResolvedValue({
            json: [],
            params: {}
        });
        mockQueryFetch.mockResolvedValue({
            json: [],
            params: {},
            ref: null
        });

        mockHydratePersistedResoniteRealtimeState.mockResolvedValue(false);
        mockEnsureResoniteRealtimePresence.mockResolvedValue(true);
        mockMergeResoniteRealtimePresence.mockImplementation((friends) =>
            Array.isArray(friends) ? friends : []
        );
        mockGetResoniteSessionByHash.mockReset();
        mockGetResoniteSessionByHash.mockReturnValue(null);
        mockSetResoniteRealtimePresenceListener.mockReturnValue(undefined);
        mockStopResoniteRealtimePresence.mockResolvedValue(undefined);
        mockClearResoniteRealtimeState.mockResolvedValue(true);
        mockDatabase.getResoniteCachedContacts.mockResolvedValue([]);
        mockDatabase.getResoniteCachedProfiles.mockResolvedValue([]);
        mockDatabase.replaceResoniteCachedContacts.mockResolvedValue([]);
        mockDatabase.setResoniteSyncState.mockResolvedValue([]);
        mockDatabase.clearResoniteCache.mockResolvedValue([]);

        const userStore = useUserStore();
        userStore.currentUser.id = 'usr_test';
        userStore.currentUser.displayName = 'Current User';
        userStore.currentUser['$resonitePresence'] = null;

        const advancedSettingsStore = useAdvancedSettingsStore();
        await advancedSettingsStore.setResoniteIntegration(true);
        await advancedSettingsStore.setResoniteApiKey('');

        watchState.isLoggedIn = true;
    });

    describe('persistence hydration and invalidation', () => {
        test('ignores corrupt structured Resonite snapshot rows during hydration', async () => {
            const store = useFriendStore();

            mockDatabase.getResoniteCachedContacts.mockResolvedValue([
                {
                    externalId: 'resonite:u-bad',
                    resoniteUserId: 'U-bad',
                    lastSuccessfulSnapshotAt: Date.now(),
                    payload: { id: '', provider: 'resonite' }
                },
                {
                    externalId: 'resonite:u-null',
                    resoniteUserId: 'U-null',
                    lastSuccessfulSnapshotAt: Date.now(),
                    payload: null
                }
            ]);

            const hydrated = await store.hydratePersistedResoniteState();

            expect(hydrated).toBe(false);
            expect(
                mockDatabase.replaceResoniteCachedContacts
            ).not.toHaveBeenCalled();
            expect(store.friends.size).toBe(0);
        });

        test('composes cached profile and realtime presence during startup hydration', async () => {
            const store = useFriendStore();
            await Promise.resolve();
            await Promise.resolve();

            mockDatabase.getResoniteCachedContacts = vi.fn(async () => [
                {
                    externalId: 'resonite:U-cached',
                    resoniteUserId: 'U-cached',
                    lastSuccessfulSnapshotAt: Date.now(),
                    payload: {
                        id: 'resonite:U-cached',
                        name: 'Cached Contact',
                        state: 'offline',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:U-cached',
                            displayName: 'Cached Contact',
                            state: 'offline',
                            status: '',
                            location: 'offline'
                        },
                        resonite: {
                            userId: 'U-cached',
                            username: 'cached-contact'
                        }
                    }
                }
            ]);
            mockDatabase.getResoniteCachedProfiles = vi.fn(async () => [
                {
                    resoniteUserId: 'U-cached',
                    expiresAt: Date.now() + 60_000,
                    payload: {
                        id: 'U-cached',
                        username: 'profile-user',
                        registrationDate: '2024-04-01T00:00:00.000Z',
                        isVerified: true,
                        tags: ['builder'],
                        profile: {
                            iconUrl: 'https://example.com/icon.png',
                            tagline: 'Profile tagline',
                            description: 'Profile description'
                        }
                    }
                }
            ]);
            mockMergeResoniteRealtimePresence.mockImplementation((friends) =>
                friends.map((friend) => ({
                    ...friend,
                    state: 'online',
                    ref: {
                        ...friend.ref,
                        state: 'online',
                        status: 'active',
                        statusDescription: 'Live status',
                        location: 'Live World'
                    },
                    resonite: {
                        ...friend.resonite,
                        locationName: 'Live World',
                        currentSessionName: 'Live World'
                    }
                }))
            );

            const userStore = useUserStore();
            userStore.currentUser.id = 'usr_test';
            const advancedSettingsStore = useAdvancedSettingsStore();
            await advancedSettingsStore.setResoniteIntegration(true);

            const hydrated = await store.hydratePersistedResoniteState();

            expect(mockDatabase.getResoniteCachedContacts).toHaveBeenCalled();
            expect(hydrated).toBe(true);

            const friend = store.friends.get('resonite:U-cached');
            expect(friend).toMatchObject({
                state: 'online',
                name: 'Cached Contact'
            });
            expect(friend.ref).toMatchObject({
                state: 'online',
                status: 'active',
                statusDescription: 'Live status',
                location: 'Live World',
                profileImageUrl: 'https://example.com/icon.png'
            });
            expect(friend.resonite).toMatchObject({
                username: 'profile-user',
                registrationDate: '2024-04-01T00:00:00.000Z',
                isVerified: true,
                locationName: 'Live World',
                currentSessionName: 'Live World',
                profile: {
                    iconUrl: 'https://example.com/icon.png',
                    tagline: 'Profile tagline',
                    description: 'Profile description'
                }
            });
        });

        test('startup-style silent preload followed by merged snapshot emits gps when session labels resolve', async () => {
            const store = useFriendStore();
            store.upsertResoniteFriend(
                {
                    id: 'resonite:U-resolved',
                    name: 'Resolved Contact',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-resolved',
                        displayName: 'Resolved Contact',
                        state: 'online',
                        status: 'active',
                        location: 'Private',
                        traveling: 'Private'
                    },
                    resonite: {
                        userId: 'U-resolved',
                        currentSessionHash: 'S-shared',
                        currentSessionName: 'Private',
                        locationName: 'Private'
                    }
                },
                { emitFeed: false }
            );

            store.upsertResoniteFriend({
                id: 'resonite:U-resolved',
                name: 'Resolved Contact',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-resolved',
                    displayName: 'Resolved Contact',
                    state: 'online',
                    status: 'active',
                    location: 'Cherry Blossom Cozy',
                    traveling: 'Cherry Blossom Cozy'
                },
                resonite: {
                    userId: 'U-resolved',
                    accessLevel: 'anyone',
                    currentSessionHash: 'S-shared',
                    currentSessionName: 'Cherry Blossom Cozy',
                    locationName: 'Cherry Blossom Cozy'
                }
            });

            expect(mockDatabase.addGPSToDatabase).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'resonite:U-resolved',
                    location: 'Cherry Blossom Cozy - Public',
                    worldName: 'Cherry Blossom Cozy - Public',
                    previousLocation: 'private'
                })
            );

            const friend = store.friends.get('resonite:U-resolved');
            expect(friend.ref.location).toBe('Cherry Blossom Cozy');
            expect(friend.resonite.locationName).toBe('Cherry Blossom Cozy');
        });

        test('ignores stale cached contacts during startup hydration even when fresher rows exist', async () => {
            const store = useFriendStore();
            await Promise.resolve();
            await Promise.resolve();

            const now = Date.now();
            mockDatabase.getResoniteCachedContacts = vi.fn(async () => [
                {
                    externalId: 'resonite:U-fresh',
                    resoniteUserId: 'U-fresh',
                    fetchedAt: now,
                    lastSuccessfulSnapshotAt: now,
                    payload: {
                        id: 'resonite:U-fresh',
                        name: 'Fresh Contact',
                        state: 'offline',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:U-fresh',
                            displayName: 'Fresh Contact',
                            state: 'offline',
                            status: '',
                            location: 'offline'
                        },
                        resonite: {
                            userId: 'U-fresh',
                            username: 'fresh-contact'
                        }
                    }
                },
                {
                    externalId: 'resonite:U-stale',
                    resoniteUserId: 'U-stale',
                    fetchedAt: now - 1000 * 60 * 60 * 24,
                    lastSuccessfulSnapshotAt: now - 1000 * 60 * 60 * 24,
                    payload: {
                        id: 'resonite:U-stale',
                        name: 'Stale Contact',
                        state: 'offline',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:U-stale',
                            displayName: 'Stale Contact',
                            state: 'offline',
                            status: '',
                            location: 'offline'
                        },
                        resonite: {
                            userId: 'U-stale',
                            username: 'stale-contact'
                        }
                    }
                }
            ]);
            mockDatabase.getResoniteCachedProfiles = vi.fn(async () => []);
            mockMergeResoniteRealtimePresence.mockImplementation(
                (friends) => friends
            );

            const userStore = useUserStore();
            userStore.currentUser.id = 'usr_test';
            const advancedSettingsStore = useAdvancedSettingsStore();
            await advancedSettingsStore.setResoniteIntegration(true);

            const hydrated = await store.hydratePersistedResoniteState();

            expect(hydrated).toBe(true);
            expect(store.friends.has('resonite:U-fresh')).toBe(true);
            expect(store.friends.has('resonite:U-stale')).toBe(false);
            expect(mockDatabase.getResoniteCachedProfiles).toHaveBeenCalledWith(
                ['U-fresh']
            );
        });

        test('clears cached Resonite state when switching to a different Resonite user', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();
            const userStore = useUserStore();

            await advancedSettingsStore.setResoniteApiKey('U-old:token-one');

            store.upsertResoniteFriend({
                id: 'resonite:u-switch',
                name: 'Switch User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-switch',
                    displayName: 'Switch User',
                    state: 'online'
                }
            });
            userStore.currentUser['$resonitePresence'] = {
                isActive: true,
                linkedUserId: 'U-old'
            };

            mockStopResoniteRealtimePresence.mockClear();
            mockClearResoniteRealtimeState.mockClear();

            await advancedSettingsStore.setResoniteApiKey('U-new:token-two');
            await Promise.resolve();
            await Promise.resolve();

            expect(store.friends.has('resonite:u-switch')).toBe(false);
            expect(userStore.currentUser['$resonitePresence']).toBeNull();
            expect(mockStopResoniteRealtimePresence).toHaveBeenCalledTimes(1);
            expect(mockClearResoniteRealtimeState).toHaveBeenCalledWith(
                'vrcx-user-usr_test'
            );
            expect(mockDatabase.clearResoniteCache).toHaveBeenCalledTimes(1);
        });

        test('keeps cached Resonite state when only the token changes for the same user', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();

            await advancedSettingsStore.setResoniteApiKey('U-stable:token-one');

            store.upsertResoniteFriend({
                id: 'resonite:u-stable',
                name: 'Stable User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-stable',
                    displayName: 'Stable User',
                    state: 'online'
                }
            });

            mockStopResoniteRealtimePresence.mockClear();
            mockClearResoniteRealtimeState.mockClear();

            await advancedSettingsStore.setResoniteApiKey('U-stable:token-two');
            await Promise.resolve();
            await Promise.resolve();

            expect(store.friends.has('resonite:u-stable')).toBe(true);
            expect(mockStopResoniteRealtimePresence).not.toHaveBeenCalled();
            expect(mockClearResoniteRealtimeState).not.toHaveBeenCalled();
        });
    });

    describe('refreshResoniteFriends', () => {
        test('VRChat friendship reconciliation ignores Resonite contacts without synthetic friend log entries', async () => {
            const store = useFriendStore();

            watchState.isFriendsLoaded = true;

            store.upsertResoniteFriend({
                id: 'resonite:U-1m51gsdtjge',
                name: 'Element',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-1m51gsdtjge',
                    displayName: 'Element',
                    state: 'offline'
                },
                resonite: {
                    userId: 'U-1m51gsdtjge',
                    latestMessageTime: '2025-01-10T12:00:00.000Z'
                }
            });

            expect(store.friendLog.has('resonite:U-1m51gsdtjge')).toBe(false);

            runUpdateFriendshipsFlow({
                friends: [],
                offlineFriends: [],
                activeFriends: [],
                onlineFriends: []
            });

            await Promise.resolve();
            await Promise.resolve();

            expect(mockFriendGetStatus).not.toHaveBeenCalled();
            expect(store.friendLog.has('resonite:U-1m51gsdtjge')).toBe(false);
            expect(store.friends.has('resonite:U-1m51gsdtjge')).toBe(true);
            expect(
                store.friendLogTable.data.find(
                    (entry) =>
                        entry.type === 'Unfriend' &&
                        entry.userId === 'resonite:U-1m51gsdtjge'
                )
            ).toBeUndefined();
        });

        test('fetches and merges Resonite friends', async () => {
            const store = useFriendStore();

            const resoniteFriends = [
                {
                    id: 'resonite:u-123',
                    name: 'ResoniteUser1',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-123',
                        displayName: 'ResoniteUser1',
                        state: 'online',
                        statusDescription: 'Testing'
                    }
                }
            ];

            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: resoniteFriends
            });

            const result = await store.refreshResoniteFriends();

            expect(result).toEqual(resoniteFriends);
            expect(store.friends.has('resonite:u-123')).toBe(true);

            const friend = store.friends.get('resonite:u-123');
            expect(friend.name).toBe('ResoniteUser1');
            expect(friend.state).toBe('online');
            expect(friend.provider).toBe('resonite');
            expect(friend.isExternal).toBe(true);
        });

        test('updates existing Resonite friend state', async () => {
            const store = useFriendStore();

            // Add initial Resonite friend
            const initialFriend = {
                id: 'resonite:u-123',
                name: 'ResoniteUser1',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'ResoniteUser1',
                    state: 'offline'
                }
            };

            store.upsertResoniteFriend(initialFriend);
            expect(store.friends.get('resonite:u-123').state).toBe('offline');

            // Update with new state
            const updatedFriend = {
                id: 'resonite:u-123',
                name: 'ResoniteUser1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'ResoniteUser1',
                    state: 'online'
                }
            };

            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [updatedFriend]
            });
            await store.refreshResoniteFriends();

            expect(store.friends.get('resonite:u-123').state).toBe('online');
        });

        test('removes stale Resonite friends', async () => {
            const store = useFriendStore();

            store.addFriend('usr_vrchat_123', 'online');

            // Add two Resonite friends
            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-123', displayName: 'User1' }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-456',
                name: 'User2',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-456', displayName: 'User2' }
            });

            expect(store.friends.has('resonite:u-123')).toBe(true);
            expect(store.friends.has('resonite:u-456')).toBe(true);

            // Fetch only returns one friend
            const updatedFriends = [
                {
                    id: 'resonite:u-123',
                    name: 'User1',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: { id: 'resonite:u-123', displayName: 'User1' }
                }
            ];

            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: updatedFriends
            });
            await store.refreshResoniteFriends();

            expect(store.friends.has('usr_vrchat_123')).toBe(true);
            expect(store.friends.has('resonite:u-123')).toBe(true);
            expect(store.friends.has('resonite:u-456')).toBe(false);
        });

        test('filters Resonite system contact from visible list', async () => {
            const store = useFriendStore();

            const resoniteFriends = [
                {
                    id: 'resonite:U-Resonite',
                    name: 'Resonite',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-Resonite',
                        displayName: 'Resonite',
                        state: 'online'
                    }
                },
                {
                    id: 'resonite:u-regular',
                    name: 'RegularUser',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-regular',
                        displayName: 'RegularUser',
                        state: 'online'
                    }
                }
            ];

            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: resoniteFriends
            });
            await store.refreshResoniteFriends();

            expect(store.friends.has('resonite:U-Resonite')).toBe(false);
            expect(store.friends.has('resonite:u-regular')).toBe(true);
        });

        test('persists silent self Resonite presence history for exact shared-session matching', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();
            const userStore = useUserStore();

            await advancedSettingsStore.setResoniteApiKey('U-self:token-one');

            mockFetchResoniteFriends.mockResolvedValueOnce({
                success: true,
                friends: [
                    {
                        id: 'resonite:U-self',
                        name: 'Current Self',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:U-self',
                            displayName: 'Current Self',
                            state: 'online',
                            status: 'active',
                            location: 'World One',
                            traveling: 'World One'
                        },
                        resonite: {
                            userId: 'U-self',
                            locationName: 'World One',
                            currentSessionName: 'World One'
                        }
                    }
                ]
            });

            mockFetchResoniteFriends.mockResolvedValueOnce({
                success: true,
                friends: [
                    {
                        id: 'resonite:U-self',
                        name: 'Current Self',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:U-self',
                            displayName: 'Current Self',
                            state: 'online',
                            status: 'active',
                            location: 'World Two',
                            traveling: 'World Two'
                        },
                        resonite: {
                            userId: 'U-self',
                            locationName: 'World Two',
                            currentSessionName: 'World Two'
                        }
                    }
                ]
            });

            await store.refreshResoniteFriends();
            await store.refreshResoniteFriends();

            expect(userStore.currentUser['$resonitePresence']).toMatchObject({
                linkedContactId: 'resonite:U-self',
                linkedUserId: 'U-self',
                locationName: 'World Two'
            });
            expect(mockDatabase['addGPSToDatabase']).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'resonite:U-self',
                    location: 'World Two',
                    previousLocation: 'World One',
                    worldName: 'World Two'
                })
            );
        });

        test('returns empty array on fetch error', async () => {
            const store = useFriendStore();

            mockFetchResoniteFriends.mockRejectedValue(
                new Error('Network error')
            );

            const result = await store.refreshResoniteFriends();

            expect(result).toEqual([]);
        });

        test('records snapshot refresh failure state in sync metadata', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();

            await advancedSettingsStore.setResoniteApiKey(
                'U-sync-user:token-one'
            );
            mockDatabase.setResoniteSyncState.mockClear();
            mockDatabase.getResoniteSyncState.mockResolvedValue({
                scope: 'vrcx-user-usr_test',
                snapshotFailureCount: 1,
                nextSnapshotRetryAt: 0,
                lastSuccessfulSnapshotAt: 123
            });
            mockFetchResoniteFriends.mockResolvedValue({
                success: false,
                friends: []
            });

            const result = await store.refreshResoniteFriends();

            expect(result).toEqual([]);
            expect(mockDatabase.setResoniteSyncState).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: 'vrcx-user-usr_test',
                    lastErrorText: 'fetch-failed',
                    activeResoniteUserId: 'U-sync-user',
                    snapshotFailureCount: 2,
                    nextSnapshotRetryAt: expect.any(Number)
                })
            );
        });

        test('records snapshot refresh success state in sync metadata', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();

            await advancedSettingsStore.setResoniteApiKey(
                'U-sync-user:token-one'
            );
            mockDatabase.setResoniteSyncState.mockClear();
            mockDatabase.getResoniteSyncState.mockResolvedValue({
                scope: 'vrcx-user-usr_test',
                snapshotFailureCount: 2,
                nextSnapshotRetryAt: 99_999,
                lastErrorText: 'fetch-failed'
            });
            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [
                    {
                        id: 'resonite:u-success',
                        name: 'Success User',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:u-success',
                            displayName: 'Success User',
                            state: 'online'
                        }
                    }
                ]
            });

            const result = await store.refreshResoniteFriends();

            expect(result).toHaveLength(1);
            expect(mockDatabase.setResoniteSyncState).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: 'vrcx-user-usr_test',
                    lastErrorText: '',
                    lastSuccessfulSnapshotAt: expect.any(Number),
                    activeResoniteUserId: 'U-sync-user',
                    snapshotFailureCount: 0,
                    nextSnapshotRetryAt: 0
                })
            );
        });

        test('records realtime refresh failure state and skips repeated setup attempts during retry window', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();
            const syncState = {
                scope: 'vrcx-user-usr_test',
                snapshotFailureCount: 0,
                nextSnapshotRetryAt: 0,
                presenceFailureCount: 0,
                nextPresenceRetryAt: 0,
                lastErrorText: ''
            };

            await advancedSettingsStore.setResoniteIntegration(true);
            await advancedSettingsStore.setResoniteApiKey(
                'U-sync-user:token-one'
            );
            mockDatabase.setResoniteSyncState.mockClear();
            mockEnsureResoniteRealtimePresence.mockResolvedValue(false);
            mockEnsureResoniteRealtimePresence.mockClear();
            mockDatabase.getResoniteSyncState.mockImplementation(async () => ({
                ...syncState
            }));
            mockDatabase.setResoniteSyncState.mockImplementation(
                async (entry) => {
                    Object.assign(syncState, entry);
                    return [];
                }
            );
            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [
                    {
                        id: 'resonite:u-success',
                        name: 'Success User',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:u-success',
                            displayName: 'Success User',
                            state: 'online'
                        }
                    }
                ]
            });

            const firstResult = await store.refreshResoniteFriends();
            const secondResult = await store.refreshResoniteFriends();

            expect(firstResult).toHaveLength(1);
            expect(secondResult).toHaveLength(1);
            expect(mockEnsureResoniteRealtimePresence).toHaveBeenCalledTimes(1);
            expect(
                mockDatabase.setResoniteSyncState.mock.calls.some(
                    ([entry]) =>
                        entry?.scope === 'vrcx-user-usr_test' &&
                        entry?.lastErrorText === 'realtime-connect-failed' &&
                        entry?.activeResoniteUserId === 'U-sync-user' &&
                        entry?.presenceFailureCount === 1 &&
                        typeof entry?.nextPresenceRetryAt === 'number' &&
                        entry.nextPresenceRetryAt > Date.now()
                )
            ).toBe(true);
        });

        test('does not rehydrate persisted realtime presence on recurring snapshot refreshes', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();

            await advancedSettingsStore.setResoniteIntegration(true);
            await advancedSettingsStore.setResoniteApiKey(
                'U-sync-user:token-one'
            );

            mockHydratePersistedResoniteRealtimeState.mockClear();
            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [
                    {
                        id: 'resonite:u-success',
                        name: 'Success User',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:u-success',
                            displayName: 'Success User',
                            state: 'online'
                        }
                    }
                ]
            });

            await store.refreshResoniteFriends();
            await store.refreshResoniteFriends();

            expect(
                mockHydratePersistedResoniteRealtimeState
            ).not.toHaveBeenCalled();
        });

        test('uses the latest realtime-merged snapshot after the listener pass', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();

            await advancedSettingsStore.setResoniteIntegration(true);
            await advancedSettingsStore.setResoniteApiKey(
                'U-sync-user:token-one'
            );

            const staleSnapshot = [
                {
                    id: 'resonite:u-water',
                    name: 'Water',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-water',
                        displayName: 'Water',
                        state: 'online',
                        status: 'active',
                        location: 'Private',
                        traveling: 'Private',
                        statusDescription: '',
                        resonite: {
                            locationName: 'Private',
                            currentSessionName: 'Private',
                            currentSessionHash: 'S-water'
                        }
                    },
                    resonite: {
                        onlineStatus: 'online',
                        locationName: 'Private',
                        currentSessionName: 'Private',
                        currentSessionHash: 'S-water'
                    }
                }
            ];
            const updatedSnapshot = [
                {
                    ...staleSnapshot[0],
                    ref: {
                        ...staleSnapshot[0].ref,
                        location: 'Smexy`s Bedroom',
                        traveling: 'Smexy`s Bedroom',
                        resonite: {
                            ...staleSnapshot[0].ref.resonite,
                            locationName: 'Smexy`s Bedroom',
                            currentSessionName: 'Smexy`s Bedroom'
                        }
                    },
                    resonite: {
                        ...staleSnapshot[0].resonite,
                        locationName: 'Smexy`s Bedroom',
                        currentSessionName: 'Smexy`s Bedroom'
                    }
                }
            ];

            let mergeCallCount = 0;
            mockMergeResoniteRealtimePresence.mockImplementation(() => {
                mergeCallCount += 1;
                return mergeCallCount === 1 ? staleSnapshot : updatedSnapshot;
            });
            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: staleSnapshot
            });

            const result = await store.refreshResoniteFriends();

            expect(result).toEqual(updatedSnapshot);
            expect(store.friends.get('resonite:u-water')?.ref?.location).toBe(
                'Smexy`s Bedroom'
            );
            expect(
                store.friends.get('resonite:u-water')?.resonite
                    ?.currentSessionName
            ).toBe('Smexy`s Bedroom');
        });

        test('records realtime refresh success state and clears presence retry window', async () => {
            const store = useFriendStore();
            const advancedSettingsStore = useAdvancedSettingsStore();
            const syncState = {
                scope: 'vrcx-user-usr_test',
                snapshotFailureCount: 0,
                nextSnapshotRetryAt: 0,
                presenceFailureCount: 2,
                nextPresenceRetryAt: 0,
                lastErrorText: 'realtime-connect-failed'
            };

            await advancedSettingsStore.setResoniteIntegration(true);
            await advancedSettingsStore.setResoniteApiKey(
                'U-sync-user:token-one'
            );
            mockDatabase.setResoniteSyncState.mockClear();
            mockEnsureResoniteRealtimePresence.mockResolvedValue(true);
            mockEnsureResoniteRealtimePresence.mockClear();
            mockDatabase.getResoniteSyncState.mockImplementation(async () => ({
                ...syncState
            }));
            mockDatabase.setResoniteSyncState.mockImplementation(
                async (entry) => {
                    Object.assign(syncState, entry);
                    return [];
                }
            );
            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [
                    {
                        id: 'resonite:u-success',
                        name: 'Success User',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:u-success',
                            displayName: 'Success User',
                            state: 'online'
                        }
                    }
                ]
            });

            const result = await store.refreshResoniteFriends();

            expect(result).toHaveLength(1);
            expect(mockEnsureResoniteRealtimePresence).toHaveBeenCalledTimes(1);
            expect(
                mockDatabase.setResoniteSyncState.mock.calls.some(
                    ([entry]) =>
                        entry?.scope === 'vrcx-user-usr_test' &&
                        entry?.lastErrorText === '' &&
                        typeof entry?.lastSuccessfulPresenceAt === 'number' &&
                        entry.lastSuccessfulPresenceAt > 0 &&
                        entry?.activeResoniteUserId === 'U-sync-user' &&
                        entry?.presenceFailureCount === 0 &&
                        entry?.nextPresenceRetryAt === 0
                )
            ).toBe(true);
        });

        test('handles non-array fetch result', async () => {
            const store = useFriendStore();

            mockFetchResoniteFriends.mockResolvedValue(null);

            const result = await store.refreshResoniteFriends();

            expect(result).toEqual([]);
        });

        test('preserves existing Resonite contacts when the refresh fails', async () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-preserved',
                name: 'Preserved User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-preserved',
                    displayName: 'Preserved User',
                    state: 'online'
                }
            });

            mockFetchResoniteFriends.mockResolvedValue({
                success: false,
                friends: []
            });

            const result = await store.refreshResoniteFriends();

            expect(result).toEqual([]);
            expect(store.friends.has('resonite:u-preserved')).toBe(true);
        });

        test('keeps pending Resonite contacts when isAccepted is false but the contact is still present', async () => {
            const store = useFriendStore();

            watchState.isFriendsLoaded = true;

            store.upsertResoniteFriend({
                id: 'resonite:U-1mImOh1WI08',
                name: 'PVNISHED',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-1mImOh1WI08',
                    displayName: 'PVNISHED',
                    state: 'offline',
                    contactStatus: 'Accepted',
                    isAccepted: false
                },
                resonite: {
                    userId: 'U-1mImOh1WI08',
                    contactStatus: 'Accepted',
                    isAccepted: false
                }
            });

            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [
                    {
                        id: 'resonite:U-1mImOh1WI08',
                        name: 'PVNISHED',
                        state: 'offline',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:U-1mImOh1WI08',
                            displayName: 'PVNISHED',
                            state: 'offline',
                            contactStatus: 'Accepted',
                            isAccepted: false
                        },
                        resonite: {
                            userId: 'U-1mImOh1WI08',
                            contactStatus: 'Accepted',
                            isAccepted: false
                        }
                    }
                ]
            });

            await store.refreshResoniteFriends();

            expect(store.friends.has('resonite:U-1mImOh1WI08')).toBe(true);
            expect(store.friendLog.has('resonite:U-1mImOh1WI08')).toBe(false);
            expect(
                store.friendLogTable.data.find(
                    (entry) =>
                        entry.type === 'Unfriend' &&
                        entry.userId === 'resonite:U-1mImOh1WI08'
                )
            ).toBeUndefined();
        });
    });

    describe('upsertResoniteFriend', () => {
        test('creates new Resonite friend', () => {
            const store = useFriendStore();

            const friendData = {
                id: 'resonite:u-new',
                name: 'NewUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-new',
                    displayName: 'NewUser',
                    state: 'online'
                }
            };

            store.upsertResoniteFriend(friendData);

            expect(store.friends.has('resonite:u-new')).toBe(true);
            const friend = store.friends.get('resonite:u-new');
            expect(friend.id).toBe('resonite:u-new');
            expect(friend.name).toBe('NewUser');
            expect(friend.state).toBe('online');
            expect(friend.provider).toBe('resonite');
            expect(friend.isExternal).toBe(true);
            expect(friend.isVIP).toBe(false);
            expect(friend.memo).toBe('');
            expect(friend.pendingOffline).toBe(false);
        });

        test('updates existing Resonite friend', () => {
            const store = useFriendStore();

            // Create initial friend
            const initialData = {
                id: 'resonite:u-123',
                name: 'User',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'offline'
                }
            };

            store.upsertResoniteFriend(initialData);

            // Update friend
            const updatedData = {
                id: 'resonite:u-123',
                name: 'User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'online'
                }
            };

            store.upsertResoniteFriend(updatedData);

            const friend = store.friends.get('resonite:u-123');
            expect(friend.state).toBe('online');
            expect(friend.name).toBe('User');
        });

        test('can suppress feed entries for non-realtime profile enrichment', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'online',
                    status: 'active',
                    statusDescription: 'Old status'
                }
            });

            mockDatabase['addStatusToDatabase'].mockClear();

            store.upsertResoniteFriend(
                {
                    id: 'resonite:u-123',
                    name: 'User',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-123',
                        displayName: 'User',
                        state: 'online',
                        status: 'busy',
                        statusDescription: 'Fresh profile status'
                    }
                },
                {
                    emitFeed: false
                }
            );

            const friend = store.friends.get('resonite:u-123');
            expect(friend.ref.status).toBe('busy');
            expect(friend.ref.statusDescription).toBe('Fresh profile status');
            expect(mockDatabase['addStatusToDatabase']).not.toHaveBeenCalled();
        });

        test('preserves fresher contact fields when an older contact snapshot arrives later', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-contact',
                name: 'Fresh Name',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-contact',
                    displayName: 'Fresh Name',
                    state: 'offline',
                    contactStatus: 'Accepted',
                    latestMessageTime: '2026-04-24T12:00:00.000Z',
                    isAccepted: true
                },
                resonite: {
                    userId: 'u-contact',
                    contactStatus: 'Accepted',
                    latestMessageTime: '2026-04-24T12:00:00.000Z',
                    isAccepted: true,
                    contactObservedAt: 200
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-contact',
                name: 'Older Name',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-contact',
                    displayName: 'Older Name',
                    state: 'offline',
                    contactStatus: 'Pending',
                    latestMessageTime: '2026-04-20T12:00:00.000Z',
                    isAccepted: false
                },
                resonite: {
                    userId: 'u-contact',
                    contactStatus: 'Pending',
                    latestMessageTime: '2026-04-20T12:00:00.000Z',
                    isAccepted: false,
                    contactObservedAt: 100
                }
            });

            const friend = store.friends.get('resonite:u-contact');
            expect(friend.name).toBe('Fresh Name');
            expect(friend.ref.displayName).toBe('Fresh Name');
            expect(friend.ref.contactStatus).toBe('Accepted');
            expect(friend.ref.latestMessageTime).toBe(
                '2026-04-24T12:00:00.000Z'
            );
            expect(friend.ref.isAccepted).toBe(true);
            expect(friend.resonite.contactObservedAt).toBe(200);
            expect(friend.resonite.mergeTrace.contact.name).toEqual(
                expect.objectContaining({
                    winner: 'existing',
                    reason: 'existing-contact-newer',
                    existingObservedAt: 200,
                    incomingObservedAt: 100,
                    selectedValue: 'Fresh Name'
                })
            );
            expect(friend.resonite.mergeTrace.contact.contactStatus).toEqual(
                expect.objectContaining({
                    winner: 'existing',
                    reason: 'existing-contact-newer',
                    existingObservedAt: 200,
                    incomingObservedAt: 100,
                    selectedValue: 'Accepted'
                })
            );
        });

        test('preserves last-known location/session data on sparse online update', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'online',
                    location: 'Some World',
                    traveling: 'Some World',
                    statusDescription: 'In Some World',
                    resonite: {
                        locationName: 'Some World',
                        currentSessionHash: 'S-hash',
                        currentSessionName: 'Some World'
                    }
                },
                resonite: {
                    locationName: 'Some World',
                    currentSessionHash: 'S-hash',
                    currentSessionName: 'Some World'
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'online',
                    location: 'offline',
                    traveling: '',
                    statusDescription: ''
                },
                resonite: {
                    appVersion: '2026.4.20.1'
                }
            });

            const friend = store.friends.get('resonite:u-123');
            expect(friend.ref.location).toBe('Some World');
            expect(friend.ref.traveling).toBe('');
            expect(friend.ref.statusDescription).toBe('In Some World');
            expect(friend.ref.resonite.locationName).toBe('Some World');
            expect(friend.ref.resonite.currentSessionHash).toBe('S-hash');
            expect(friend.ref.resonite.currentSessionName).toBe('Some World');
        });

        test('queues Resonite offline updates before committing them', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'online',
                    status: 'active',
                    location: 'Some World',
                    traveling: 'Some World',
                    statusDescription:
                        'Online on version 2026.4.20.1323+ResoniteModLoader.dll of VR'
                },
                resonite: {
                    locationName: 'Some World',
                    currentSessionHash: 'S-hash',
                    currentSessionName: 'Some World'
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: '',
                    statusDescription: ''
                },
                resonite: {
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            });

            const friend = store.friends.get('resonite:u-123');
            expect(friend.state).toBe('online');
            expect(friend.pendingOffline).toBe(true);
            expect(store.pendingOfflineMap.has('resonite:u-123')).toBe(true);
            expect(friend.ref.statusDescription).toContain('Online on version');
        });

        test('contacts-only snapshots do not force an existing live friend offline', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-contacts-only',
                name: 'Contacts User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-contacts-only',
                    displayName: 'Contacts User',
                    state: 'online',
                    status: 'active',
                    location: 'Actual World',
                    traveling: 'Actual World',
                    statusDescription: 'Online',
                    resonite: {
                        locationName: 'Actual World',
                        currentSessionHash: 'S-actual',
                        currentSessionName: 'Actual World'
                    }
                },
                resonite: {
                    contactObservedAt: 100,
                    onlineStatus: 'online',
                    locationName: 'Actual World',
                    currentSessionHash: 'S-actual',
                    currentSessionName: 'Actual World',
                    hasPresenceSignals: true,
                    realtime: {
                        updatedAt: 300,
                        currentSessionHash: 'S-actual',
                        currentSessionName: 'Actual World'
                    }
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-contacts-only',
                name: 'Contacts User',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-contacts-only',
                    displayName: 'Contacts User',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: '',
                    statusDescription: '',
                    contactStatus: 'Accepted',
                    latestMessageTime: '2026-04-24T12:00:00.000Z',
                    isAccepted: true
                },
                resonite: {
                    contactStatus: 'Accepted',
                    latestMessageTime: '2026-04-24T12:00:00.000Z',
                    isAccepted: true,
                    contactObservedAt: 200,
                    hasPresenceSignals: false,
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            });

            const friend = store.friends.get('resonite:u-contacts-only');
            expect(friend.state).toBe('online');
            expect(friend.pendingOffline).toBe(false);
            expect(
                store.pendingOfflineMap.has('resonite:u-contacts-only')
            ).toBe(false);
            expect(friend.ref.location).toBe('Actual World');
            expect(friend.ref.resonite.currentSessionHash).toBe('S-actual');
            expect(friend.ref.contactStatus).toBe('Accepted');
            expect(friend.ref.latestMessageTime).toBe(
                '2026-04-24T12:00:00.000Z'
            );
            expect(friend.resonite.hasPresenceSignals).toBe(false);
        });

        test('contacts-only snapshots preserve unchanged realtime presence within the refresh grace window', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-04-27T21:00:00.000Z'));

            try {
                const store = useFriendStore();
                const now = Date.now();

                store.upsertResoniteFriend({
                    id: 'resonite:u-contacts-grace',
                    name: 'Grace User',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-contacts-grace',
                        displayName: 'Grace User',
                        state: 'online',
                        status: 'active',
                        location: 'Actual World',
                        traveling: 'Actual World',
                        statusDescription: 'Online',
                        resonite: {
                            locationName: 'Actual World',
                            currentSessionHash: 'S-actual',
                            currentSessionName: 'Actual World'
                        }
                    },
                    resonite: {
                        contactObservedAt: now - 20 * 60_000,
                        onlineStatus: 'online',
                        locationName: 'Actual World',
                        currentSessionHash: 'S-actual',
                        currentSessionName: 'Actual World',
                        hasPresenceSignals: true,
                        realtime: {
                            updatedAt: now - 5 * 60_000,
                            currentSessionHash: 'S-actual',
                            currentSessionName: 'Actual World'
                        }
                    }
                });

                store.upsertResoniteFriend({
                    id: 'resonite:u-contacts-grace',
                    name: 'Grace User',
                    state: 'offline',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-contacts-grace',
                        displayName: 'Grace User',
                        state: 'offline',
                        status: '',
                        location: 'offline',
                        traveling: '',
                        statusDescription: '',
                        contactStatus: 'Accepted',
                        latestMessageTime: '2026-04-27T21:00:00.000Z',
                        isAccepted: true
                    },
                    resonite: {
                        contactStatus: 'Accepted',
                        latestMessageTime: '2026-04-27T21:00:00.000Z',
                        isAccepted: true,
                        contactObservedAt: now,
                        hasPresenceSignals: false,
                        locationName: '',
                        currentSessionHash: '',
                        currentSessionName: ''
                    }
                });

                const friend = store.friends.get('resonite:u-contacts-grace');
                expect(friend.state).toBe('online');
                expect(friend.pendingOffline).toBe(false);
                expect(friend.ref.location).toBe('Actual World');
                expect(friend.ref.resonite.currentSessionHash).toBe('S-actual');
                expect(friend.ref.contactStatus).toBe('Accepted');
            } finally {
                vi.useRealTimers();
            }
        });

        test('repeated contacts-only snapshots eventually clear stale realtime presence offline', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-04-27T21:00:00.000Z'));

            try {
                const store = useFriendStore();
                const now = Date.now();

                store.upsertResoniteFriend({
                    id: 'resonite:u-contacts-repeat-offline',
                    name: 'Repeat Offline User',
                    state: 'online',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-contacts-repeat-offline',
                        displayName: 'Repeat Offline User',
                        state: 'online',
                        status: 'active',
                        location: 'Actual World',
                        traveling: 'Actual World',
                        statusDescription: 'Online',
                        resonite: {
                            locationName: 'Actual World',
                            currentSessionHash: 'S-actual',
                            currentSessionName: 'Actual World'
                        }
                    },
                    resonite: {
                        contactObservedAt: now - 20 * 60_000,
                        onlineStatus: 'online',
                        locationName: 'Actual World',
                        currentSessionHash: 'S-actual',
                        currentSessionName: 'Actual World',
                        hasPresenceSignals: true,
                        realtime: {
                            updatedAt: now - 5 * 60_000,
                            currentSessionHash: 'S-actual',
                            currentSessionName: 'Actual World'
                        }
                    }
                });

                store.upsertResoniteFriend({
                    id: 'resonite:u-contacts-repeat-offline',
                    name: 'Repeat Offline User',
                    state: 'offline',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-contacts-repeat-offline',
                        displayName: 'Repeat Offline User',
                        state: 'offline',
                        status: '',
                        location: 'offline',
                        traveling: '',
                        statusDescription: '',
                        contactStatus: 'Accepted',
                        latestMessageTime: '2026-04-27T21:00:00.000Z',
                        isAccepted: true
                    },
                    resonite: {
                        contactStatus: 'Accepted',
                        latestMessageTime: '2026-04-27T21:00:00.000Z',
                        isAccepted: true,
                        contactObservedAt: now,
                        hasPresenceSignals: false,
                        locationName: '',
                        currentSessionHash: '',
                        currentSessionName: ''
                    }
                });

                let friend = store.friends.get(
                    'resonite:u-contacts-repeat-offline'
                );
                expect(friend.state).toBe('online');
                expect(friend.ref.location).toBe('Actual World');

                vi.setSystemTime(new Date('2026-04-27T21:05:00.000Z'));

                store.upsertResoniteFriend({
                    id: 'resonite:u-contacts-repeat-offline',
                    name: 'Repeat Offline User',
                    state: 'offline',
                    provider: 'resonite',
                    isExternal: true,
                    ref: {
                        id: 'resonite:u-contacts-repeat-offline',
                        displayName: 'Repeat Offline User',
                        state: 'offline',
                        status: '',
                        location: 'offline',
                        traveling: '',
                        statusDescription: '',
                        contactStatus: 'Accepted',
                        latestMessageTime: '2026-04-27T21:05:00.000Z',
                        isAccepted: true
                    },
                    resonite: {
                        contactStatus: 'Accepted',
                        latestMessageTime: '2026-04-27T21:05:00.000Z',
                        isAccepted: true,
                        contactObservedAt: now + 5 * 60_000,
                        hasPresenceSignals: false,
                        locationName: '',
                        currentSessionHash: '',
                        currentSessionName: ''
                    }
                });

                friend = store.friends.get(
                    'resonite:u-contacts-repeat-offline'
                );
                expect(friend.state).toBe('offline');
                expect(friend.pendingOffline).toBe(false);
                expect(friend.ref.location).toBe('offline');
                expect(friend.ref.resonite.currentSessionHash).toBe('');
                expect(friend.ref.contactStatus).toBe('Accepted');
            } finally {
                vi.useRealTimers();
            }
        });

        test('contacts-only snapshots clear stale live metadata when newer than cached realtime', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-stale-contacts-only',
                name: 'Stale Contacts User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-stale-contacts-only',
                    displayName: 'Stale Contacts User',
                    state: 'online',
                    status: 'active',
                    location: 'Soft Sea of Stars',
                    traveling: 'Soft Sea of Stars',
                    statusDescription: 'Online',
                    resonite: {
                        locationName: 'Soft Sea of Stars',
                        currentSessionHash: 'S-stale',
                        currentSessionName: 'Soft Sea of Stars'
                    }
                },
                resonite: {
                    contactObservedAt: 100,
                    onlineStatus: 'online',
                    locationName: 'Soft Sea of Stars',
                    currentSessionHash: 'S-stale',
                    currentSessionName: 'Soft Sea of Stars',
                    hasPresenceSignals: true,
                    realtime: {
                        updatedAt: 100,
                        currentSessionHash: 'S-stale',
                        currentSessionName: 'Soft Sea of Stars'
                    }
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-stale-contacts-only',
                name: 'Stale Contacts User',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-stale-contacts-only',
                    displayName: 'Stale Contacts User',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: '',
                    statusDescription: '',
                    contactStatus: 'Accepted',
                    latestMessageTime: '2026-04-24T12:10:00.000Z',
                    isAccepted: true
                },
                resonite: {
                    contactStatus: 'Accepted',
                    latestMessageTime: '2026-04-24T12:10:00.000Z',
                    isAccepted: true,
                    contactObservedAt: 200,
                    hasPresenceSignals: false,
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            });

            const friend = store.friends.get('resonite:u-stale-contacts-only');
            expect(friend.state).toBe('offline');
            expect(friend.pendingOffline).toBe(false);
            expect(
                store.pendingOfflineMap.has('resonite:u-stale-contacts-only')
            ).toBe(false);
            expect(friend.ref.location).toBe('offline');
            expect(friend.ref.resonite.locationName).toBe('');
            expect(friend.ref.resonite.currentSessionHash).toBe('');
            expect(friend.ref.resonite.currentSessionName).toBe('');
            expect(friend.ref.contactStatus).toBe('Accepted');
            expect(friend.ref.latestMessageTime).toBe(
                '2026-04-24T12:10:00.000Z'
            );
        });

        test('does not record Resonite friend or unfriend history in the shared friend log', async () => {
            const store = useFriendStore();
            watchState.isFriendsLoaded = true;

            store.upsertResoniteFriend({
                id: 'resonite:u-history',
                name: 'History User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-history',
                    displayName: 'History User',
                    state: 'online',
                    latestMessageTime: '2025-01-10T12:00:00.000Z'
                },
                resonite: {
                    latestMessageTime: '2025-01-10T12:00:00.000Z'
                }
            });

            expect(store.friendLog.has('resonite:u-history')).toBe(false);
            expect(
                store.friendLogTable.data.find(
                    (entry) =>
                        entry.type === 'Friend' &&
                        entry.userId === 'resonite:u-history'
                )
            ).toBeUndefined();

            store.removeStaleResoniteFriends(new Set());

            expect(store.friendLog.has('resonite:u-history')).toBe(false);
            expect(
                store.friendLogTable.data.find(
                    (entry) =>
                        entry.type === 'Unfriend' &&
                        entry.userId === 'resonite:u-history'
                )
            ).toBeUndefined();
        });

        test('clears stale Resonite live metadata when pending offline commits', async () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'online',
                    status: 'active',
                    location: 'Some World',
                    traveling: 'Some World',
                    statusDescription:
                        'Online on version 2026.4.20.1323+ResoniteModLoader.dll of VR',
                    resonite: {
                        locationName: 'Some World',
                        currentSessionHash: 'S-hash',
                        currentSessionName: 'Some World'
                    }
                },
                resonite: {
                    locationName: 'Some World',
                    currentSessionHash: 'S-hash',
                    currentSessionName: 'Some World'
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-123',
                name: 'User',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'User',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: '',
                    statusDescription: ''
                },
                resonite: {
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            });

            const pending = store.pendingOfflineMap.get('resonite:u-123');
            await runPendingOfflineTickFlow({
                now: () => pending.startTime + store.pendingOfflineDelay + 1
            });

            const friend = store.friends.get('resonite:u-123');
            expect(friend.state).toBe('offline');
            expect(friend.pendingOffline).toBe(false);
            expect(store.pendingOfflineMap.has('resonite:u-123')).toBe(false);
            expect(friend.ref.location).toBe('offline');
            expect(friend.ref.traveling).toBe('');
            expect(friend.ref.status).toBe('');
            expect(friend.ref.statusDescription).toBe('');
            expect(friend.ref.resonite.locationName).toBe('');
            expect(friend.ref.resonite.currentSessionHash).toBe('');
            expect(friend.ref.resonite.currentSessionName).toBe('');
        });

        test('preserves resolved Resonite session metadata across sparse online updates', () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-session',
                name: 'Session User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-session',
                    displayName: 'Session User',
                    state: 'online',
                    status: 'active',
                    location: 'Shared World',
                    traveling: 'Shared World',
                    statusDescription: 'Online',
                    resonite: {
                        locationName: 'Shared World',
                        currentSessionHash: 'S-shared',
                        currentSessionName: 'Shared World',
                        accessLevel: 'contactsplus'
                    }
                },
                resonite: {
                    locationName: 'Shared World',
                    currentSessionHash: 'S-shared',
                    currentSessionName: 'Shared World',
                    accessLevel: 'contactsplus'
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-session',
                name: 'Session User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-session',
                    displayName: 'Session User',
                    state: 'online',
                    status: 'active',
                    location: '',
                    traveling: '',
                    statusDescription: 'Still online'
                },
                resonite: {
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            });

            const friend = store.friends.get('resonite:u-session');
            expect(friend.state).toBe('online');
            expect(friend.ref.location).toBe('Shared World');
            expect(friend.ref.traveling).toBe('');
            expect(friend.ref.resonite.currentSessionHash).toBe('S-shared');
            expect(friend.ref.resonite.currentSessionName).toBe('Shared World');
            expect(friend.resonite.currentSessionHash).toBe('S-shared');
            expect(friend.resonite.currentSessionName).toBe('Shared World');
        });

        test('preserves Resonite last activity timestamps across offline commits', async () => {
            const store = useFriendStore();

            store.upsertResoniteFriend({
                id: 'resonite:u-activity',
                name: 'Activity User',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-activity',
                    displayName: 'Activity User',
                    state: 'online',
                    status: 'active',
                    location: 'Some World',
                    traveling: 'Some World',
                    last_activity: '2025-01-11T12:00:00.000Z',
                    last_login: '2025-01-11T11:00:00.000Z'
                },
                resonite: {
                    realtime: {
                        lastStatusChange: '2025-01-11T12:00:00.000Z',
                        lastPresenceTimestamp: '2025-01-11T11:00:00.000Z'
                    }
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-activity',
                name: 'Activity User',
                state: 'offline',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-activity',
                    displayName: 'Activity User',
                    state: 'offline',
                    status: '',
                    location: 'offline',
                    traveling: '',
                    statusDescription: ''
                },
                resonite: {
                    locationName: '',
                    currentSessionHash: '',
                    currentSessionName: ''
                }
            });

            const pending = store.pendingOfflineMap.get('resonite:u-activity');
            await runPendingOfflineTickFlow({
                now: () => pending.startTime + store.pendingOfflineDelay + 1
            });

            const friend = store.friends.get('resonite:u-activity');
            expect(friend.ref.last_activity).toBe('2025-01-11T12:00:00.000Z');
            expect(friend.ref.last_login).toBe('2025-01-11T11:00:00.000Z');
        });

        test('syncs an open Resonite user dialog when live presence changes', async () => {
            const store = useFriendStore();
            const userStore = useUserStore();

            mockDatabase['getUserStats'].mockResolvedValue({
                userId: 'resonite:U-1m6uEMdcCeW',
                lastSeen: '2026-04-22T07:44:00.000Z',
                joinCount: 3,
                timeSpent: 3_600_000,
                previousDisplayNames: new Map()
            });

            store.upsertResoniteFriend({
                id: 'resonite:U-1m6uEMdcCeW',
                name: 'Vilhelm',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-1m6uEMdcCeW',
                    displayName: 'Vilhelm',
                    state: 'online',
                    status: 'active',
                    profileImageUrl: 'https://example.com/resonite-profile.png',
                    location: 'Old World',
                    traveling: 'Old World',
                    statusDescription: 'Online on version 2026.4.20 of Screen',
                    last_activity: '2026-04-22T06:35:00.000Z',
                    last_login: '2026-04-22T06:35:00.000Z',
                    resonite: {
                        locationName: 'Old World',
                        currentSessionName: 'Old World'
                    }
                },
                resonite: {
                    locationName: 'Old World',
                    currentSessionName: 'Old World'
                }
            });

            userStore.userDialog.visible = true;
            userStore.userDialog.isExternal = true;
            userStore.userDialog.id = 'resonite:U-1m6uEMdcCeW';
            userStore.userDialog.ref = {
                id: 'resonite:U-1m6uEMdcCeW',
                displayName: 'Vilhelm',
                state: 'online',
                status: 'active',
                location: 'Old World',
                travelingToLocation: 'Old World',
                statusDescription: 'Online on version 2026.4.20 of Screen',
                last_activity: '2026-04-22T06:35:00.000Z',
                last_login: '2026-04-22T06:35:00.000Z',
                resonite: {
                    locationName: 'Old World',
                    currentSessionName: 'Old World'
                },
                $location: {},
                $location_at: 1_000,
                $travelingToTime: 1_000,
                $online_for: 1_000,
                $offline_for: '',
                $active_for: ''
            };
            userStore.userDialog.friend = store.friends.get(
                'resonite:U-1m6uEMdcCeW'
            );
            userStore.currentUser['$resonitePresence'] = {
                linkedContactId: 'resonite:U-self',
                linkedUserId: 'U-self'
            };

            mockDatabase['getUserStats'].mockClear();

            store.upsertResoniteFriend({
                id: 'resonite:U-1m6uEMdcCeW',
                name: 'Vilhelm',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:U-1m6uEMdcCeW',
                    displayName: 'Vilhelm',
                    state: 'online',
                    status: 'busy',
                    profileImageUrl: 'https://example.com/resonite-profile.png',
                    location: 'The Fishing Mall',
                    traveling: 'The Fishing Mall',
                    statusDescription:
                        'Online on version 2026.4.20.1323 of Screen',
                    last_activity: '2026-04-22T07:44:00.000Z',
                    last_login: '2026-04-22T06:35:00.000Z',
                    resonite: {
                        locationName: 'The Fishing Mall',
                        currentSessionName: 'The Fishing Mall'
                    }
                },
                resonite: {
                    locationName: 'The Fishing Mall',
                    currentSessionName: 'The Fishing Mall'
                }
            });

            await Promise.resolve();
            await Promise.resolve();

            expect(userStore.userDialog.ref.location).toBe('The Fishing Mall');
            expect(userStore.userDialog.ref.statusDescription).toBe(
                'Online on version 2026.4.20.1323 of Screen'
            );
            expect(userStore.userDialog.ref.currentAvatarImageUrl).toBe(
                'https://example.com/resonite-profile.png'
            );
            expect(
                userStore.userDialog.ref.currentAvatarThumbnailImageUrl
            ).toBe('https://example.com/resonite-profile.png');
            expect(userStore.userDialog.ref.profilePicOverride).toBe('');
            expect(userStore.userDialog.ref.profilePicOverrideThumbnail).toBe(
                ''
            );
            expect(userStore.userDialog.ref.resonite.currentSessionName).toBe(
                'The Fishing Mall'
            );
            expect(userStore.userDialog.friend).toBe(
                store.friends.get('resonite:U-1m6uEMdcCeW')
            );
            expect(mockDatabase['getUserStats']).toHaveBeenCalledTimes(1);
            expect(mockDatabase['getUserStats']).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'resonite:U-1m6uEMdcCeW',
                    sharedOnly: true,
                    sharedWithUserId: 'resonite:U-self'
                }),
                false
            );
            expect(userStore.userDialog.lastSeen).toBe(
                '2026-04-22T07:44:00.000Z'
            );
            expect(userStore.userDialog.joinCount).toBe(3);
            expect(userStore.userDialog.timeSpent).toBe(3_600_000);
        });

        test('rejects invalid friend data', () => {
            const store = useFriendStore();

            // Missing id
            store.upsertResoniteFriend({ name: 'User', provider: 'resonite' });
            expect(store.friends.size).toBe(0);

            // Missing provider
            store.upsertResoniteFriend({ id: 'resonite:u-123', name: 'User' });
            expect(store.friends.size).toBe(0);

            // Null data
            store.upsertResoniteFriend(null);
            expect(store.friends.size).toBe(0);
        });
    });

    describe('removeStaleResoniteFriends', () => {
        test('removes friends not in current set', () => {
            const store = useFriendStore();

            // Add three Resonite friends
            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'User1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-1', displayName: 'User1' }
            });
            store.upsertResoniteFriend({
                id: 'resonite:u-2',
                name: 'User2',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-2', displayName: 'User2' }
            });
            store.upsertResoniteFriend({
                id: 'resonite:u-3',
                name: 'User3',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-3', displayName: 'User3' }
            });

            expect(store.friends.size).toBe(3);

            // Keep only u-1 and u-2
            const currentIds = new Set(['resonite:u-1', 'resonite:u-2']);
            store.removeStaleResoniteFriends(currentIds);

            expect(store.friends.has('resonite:u-1')).toBe(true);
            expect(store.friends.has('resonite:u-2')).toBe(true);
            expect(store.friends.has('resonite:u-3')).toBe(false);
            expect(store.friends.size).toBe(2);
        });

        test('only removes Resonite friends', () => {
            const store = useFriendStore();

            // Add a VRChat friend (manually, since VRChat friends are added via normal flow)
            store.addFriend('usr_vrchat_123', 'online');

            // Add Resonite friends
            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'ResoniteUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-1', displayName: 'ResoniteUser' }
            });

            expect(store.friends.size).toBe(2);

            // Remove stale with empty set
            store.removeStaleResoniteFriends(new Set());

            // VRChat friend should still be there
            expect(store.friends.has('usr_vrchat_123')).toBe(true);
            // Resonite friend should be removed
            expect(store.friends.has('resonite:u-1')).toBe(false);
            expect(store.friends.size).toBe(1);
        });

        test('preserves VRChat favorited Resonite friends', () => {
            const store = useFriendStore();

            // Add a Resonite friend
            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'FavoriteUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-1', displayName: 'FavoriteUser' }
            });

            // Favorite it
            store.localFavoriteFriends.add('resonite:u-1');
            expect(store.localFavoriteFriends.has('resonite:u-1')).toBe(true);

            // Remove with empty set (stale)
            store.removeStaleResoniteFriends(new Set());

            // Both friend and favorite should be removed
            expect(store.friends.has('resonite:u-1')).toBe(false);
            expect(store.localFavoriteFriends.has('resonite:u-1')).toBe(false);
        });
    });

    describe('Resonite friend properties', () => {
        test('Resonite friend has correct provider metadata', () => {
            const store = useFriendStore();

            const friendData = {
                id: 'resonite:u-123',
                name: 'ResoniteUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-123', displayName: 'ResoniteUser' }
            };

            store.upsertResoniteFriend(friendData);
            const friend = store.friends.get('resonite:u-123');

            expect(friend.provider).toBe('resonite');
            expect(friend.isExternal).toBe(true);
            expect(friend.isVIP).toBe(false); // Not favorited by default
            expect(friend.memo).toBe('');
        });

        test('Resonite friend can be marked as VIP', () => {
            const store = useFriendStore();

            const friendData = {
                id: 'resonite:u-123',
                name: 'ResoniteUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-123', displayName: 'ResoniteUser' }
            };

            store.upsertResoniteFriend(friendData);
            const friend = store.friends.get('resonite:u-123');

            // Mark as favorite
            store.localFavoriteFriends.add(friend.id);
            friend.isVIP = true;

            expect(friend.isVIP).toBe(true);
            expect(store.localFavoriteFriends.has('resonite:u-123')).toBe(true);
        });
    });

    describe('Mixed provider scenarios', () => {
        test('handles mix of VRChat and Resonite friends', () => {
            const store = useFriendStore();

            // Add VRChat friend
            store.addFriend('usr_vrchat_123', 'online');

            // Add Resonite friend
            store.upsertResoniteFriend({
                id: 'resonite:u-456',
                name: 'ResoniteUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-456', displayName: 'ResoniteUser' }
            });

            expect(store.friends.size).toBe(2);

            // Verify both have correct properties
            const vrchatFriend = store.friends.get('usr_vrchat_123');
            expect(vrchatFriend.isExternal).toBeUndefined(); // VRChat friends don't have this

            const resoniteFriend = store.friends.get('resonite:u-456');
            expect(resoniteFriend.isExternal).toBe(true);
            expect(resoniteFriend.provider).toBe('resonite');
        });

        test('refresh only removes Resonite friends, not VRChat', async () => {
            const store = useFriendStore();

            // Add VRChat friend
            store.addFriend('usr_vrchat_123', 'online');

            // Add Resonite friends
            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'ResoniteUser1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-1', displayName: 'ResoniteUser1' }
            });
            store.upsertResoniteFriend({
                id: 'resonite:u-2',
                name: 'ResoniteUser2',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-2', displayName: 'ResoniteUser2' }
            });

            expect(store.friends.size).toBe(3);

            // Refresh returns only one Resonite friend
            mockFetchResoniteFriends.mockResolvedValue({
                success: true,
                friends: [
                    {
                        id: 'resonite:u-1',
                        name: 'ResoniteUser1',
                        state: 'online',
                        provider: 'resonite',
                        isExternal: true,
                        ref: {
                            id: 'resonite:u-1',
                            displayName: 'ResoniteUser1'
                        }
                    }
                ]
            });

            await store.refreshResoniteFriends();

            // VRChat friend should still be there
            expect(store.friends.has('usr_vrchat_123')).toBe(true);
            // One Resonite friend updated
            expect(store.friends.has('resonite:u-1')).toBe(true);
            expect(store.friends.has('resonite:u-2')).toBe(false);
            expect(store.friends.size).toBe(2);
        });

        test('VRChat refreshFriendsStatus does not remove Resonite entries', () => {
            const store = useFriendStore();

            store.addFriend('usr_vrchat_123', 'online');
            store.upsertResoniteFriend({
                id: 'resonite:u-keep',
                name: 'ResoniteUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-keep', displayName: 'ResoniteUser' }
            });

            store.refreshFriendsStatus({
                friends: ['usr_vrchat_123'],
                offlineFriends: [],
                activeFriends: [],
                onlineFriends: ['usr_vrchat_123']
            });

            expect(store.friends.has('usr_vrchat_123')).toBe(true);
            expect(store.friends.has('resonite:u-keep')).toBe(true);
        });

        test('groups same-session Resonite friends by resolved session id before transient hashes', () => {
            const store = useFriendStore();

            mockGetResoniteSessionByHash.mockImplementation((sessionHash) => {
                if (sessionHash === 'S-first' || sessionHash === 'S-second') {
                    return {
                        sessionId: 'session-stable-123',
                        accessLevel: 'contacts'
                    };
                }

                return null;
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'ResoniteUser1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-1',
                    displayName: 'ResoniteUser1',
                    resonite: {
                        currentSessionHash: 'S-first'
                    }
                },
                resonite: {
                    currentSessionHash: 'S-first',
                    currentSessionName: 'Shared Session'
                }
            });
            store.upsertResoniteFriend({
                id: 'resonite:u-2',
                name: 'ResoniteUser2',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-2',
                    displayName: 'ResoniteUser2',
                    resonite: {
                        currentSessionHash: 'S-second'
                    }
                },
                resonite: {
                    currentSessionHash: 'S-second',
                    currentSessionName: 'Shared Session'
                }
            });

            expect(store.resoniteFriendsInSameSession).toHaveLength(1);
            expect(store.resoniteFriendsInSameSession[0]).toHaveLength(2);
        });

        test('keeps same-session Resonite grouping stable across refresh hash rotation until the new hashes resolve', () => {
            const store = useFriendStore();

            mockGetResoniteSessionByHash.mockImplementation((sessionHash) => {
                if (
                    sessionHash === 'S-first-old' ||
                    sessionHash === 'S-second-old'
                ) {
                    return {
                        sessionId: 'session-stable-123',
                        accessLevel: 'contacts',
                        broadcastKey: 'U-host:shared-room'
                    };
                }

                return null;
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'ResoniteUser1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-1',
                    displayName: 'ResoniteUser1',
                    location: 'Shared Session',
                    resonite: {
                        currentSessionHash: 'S-first-old',
                        sessionId: 'session-stable-123',
                        broadcastKey: 'U-host:shared-room'
                    }
                },
                resonite: {
                    currentSessionHash: 'S-first-old',
                    currentSessionName: 'Shared Session',
                    sessionId: 'session-stable-123',
                    broadcastKey: 'U-host:shared-room'
                }
            });
            store.upsertResoniteFriend({
                id: 'resonite:u-2',
                name: 'ResoniteUser2',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-2',
                    displayName: 'ResoniteUser2',
                    location: 'Shared Session',
                    resonite: {
                        currentSessionHash: 'S-second-old',
                        sessionId: 'session-stable-123',
                        broadcastKey: 'U-host:shared-room'
                    }
                },
                resonite: {
                    currentSessionHash: 'S-second-old',
                    currentSessionName: 'Shared Session',
                    sessionId: 'session-stable-123',
                    broadcastKey: 'U-host:shared-room'
                }
            });

            store.upsertResoniteFriend({
                id: 'resonite:u-1',
                name: 'ResoniteUser1',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-1',
                    displayName: 'ResoniteUser1',
                    state: 'online',
                    status: 'active',
                    location: 'Shared Session',
                    traveling: 'Shared Session'
                },
                resonite: {
                    currentSessionHash: 'S-first-new',
                    currentSessionName: 'Shared Session'
                }
            });
            store.upsertResoniteFriend({
                id: 'resonite:u-2',
                name: 'ResoniteUser2',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-2',
                    displayName: 'ResoniteUser2',
                    state: 'online',
                    status: 'active',
                    location: 'Shared Session',
                    traveling: 'Shared Session'
                },
                resonite: {
                    currentSessionHash: 'S-second-new',
                    currentSessionName: 'Shared Session'
                }
            });

            expect(store.resoniteFriendsInSameSession).toHaveLength(1);
            expect(store.resoniteFriendsInSameSession[0]).toHaveLength(2);
        });
    });
});
