import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getUserMemo: vi.fn(),
    fetchResoniteUserProfiles: vi.fn(),
    mergeResoniteUserProfile: vi.fn(),
    userStore: {
        currentUser: {
            id: 'usr_self',
            $resonitePresence: null
        },
        userDialog: {
            id: null,
            ref: null,
            friend: null,
            visible: false,
            loading: false,
            memo: '',
            note: '',
            avatars: [],
            worlds: [],
            users: [],
            instance: {
                ref: {},
                users: []
            }
        },
        showUserDialogHistory: new Set(),
        applyUserDialogLocation: vi.fn()
    },
    uiStore: {
        openDialog: vi.fn(),
        setDialogCrumbLabel: vi.fn(),
        jumpBackDialogCrumb: vi.fn()
    },
    friendStore: {
        friends: new Map(),
        upsertResoniteFriend: vi.fn()
    },
    locationStore: {
        lastLocation: {
            playerList: new Map()
        }
    },
    moderationStore: {
        cachedPlayerModerations: new Map()
    },
    favoriteStore: {
        getCachedFavoritesByObjectId: vi.fn(() => false),
        isInAnyLocalFriendGroup: vi.fn(() => false)
    },
    appearanceSettingsStore: {
        hideUnfriends: false
    },
    advancedSettingsStore: {
        resoniteApiKey: 'U-self:session-token'
    },
    database: {
        getUserStats: vi.fn(),
        getFriendLogHistoryForUserId: vi.fn()
    },
    toast: {
        error: vi.fn(),
        success: vi.fn()
    }
}));

vi.mock('vue-sonner', () => ({
    toast: mocks.toast
}));

vi.mock('../../plugins/i18n', () => ({
    i18n: {
        global: {
            t: (key) => key
        }
    }
}));

vi.mock('../../shared/utils', () => ({
    arraysMatch: vi.fn(() => false),
    computeUserPlatform: vi.fn(() => ''),
    createDefaultUserRef: (json = {}) => ({
        id: '',
        displayName: '',
        state: 'offline',
        status: '',
        statusDescription: '',
        location: '',
        bio: '',
        note: '',
        currentAvatarImageUrl: '',
        currentAvatarThumbnailImageUrl: '',
        profileImageUrl: '',
        userIcon: '',
        resonite: {},
        ...json
    }),
    diffObjectProps: vi.fn(() => ({})),
    evictMapCache: vi.fn(),
    extractFileId: vi.fn(() => ''),
    findUserByDisplayName: vi.fn(() => null),
    getWorldName: vi.fn().mockResolvedValue(''),
    isRealInstance: vi.fn(() => false),
    parseLocation: vi.fn(() => ({})),
    sanitizeUserJson: vi.fn()
}));

vi.mock('../../shared/utils/resonite', () => ({
    isResoniteContactLike: (friendCtx) =>
        Boolean(
            friendCtx &&
            (friendCtx.isAccepted ||
                friendCtx.contactStatus ||
                friendCtx.contactUsername ||
                friendCtx.latestMessageTime)
        ),
    stripResonitePrefix: (value) =>
        String(value || '').replace(/^resonite:/i, '')
}));

vi.mock('../memoCoordinator', () => ({
    getUserMemo: (...args) => mocks.getUserMemo(...args)
}));

vi.mock('../../api', () => ({
    avatarRequest: {},
    instanceRequest: {},
    queryRequest: {
        fetch: vi.fn()
    },
    userRequest: {}
}));

vi.mock('../../services/request', () => ({
    processBulk: vi.fn(),
    request: vi.fn()
}));

vi.mock('../../services/resoniteFriends', () => ({
    fetchResoniteUserProfiles: (...args) =>
        mocks.fetchResoniteUserProfiles(...args),
    mergeResoniteUserProfile: (...args) =>
        mocks.mergeResoniteUserProfile(...args)
}));

vi.mock('../../services/appConfig', () => ({
    AppDebug: {
        endpointDomain: 'https://example.test'
    }
}));

vi.mock('../../services/database', () => ({
    database: mocks.database
}));

vi.mock('../../queries', () => ({
    patchUserFromEvent: vi.fn()
}));

vi.mock('../../services/watchState', () => ({
    watchState: {
        isFriendsLoaded: true,
        isLoggedIn: true
    }
}));

vi.mock('../avatarCoordinator', () => ({
    applyAvatar: vi.fn(),
    removeAvatarFromCache: vi.fn(),
    showAvatarDialog: vi.fn()
}));

vi.mock('../favoriteCoordinator', () => ({
    applyFavorite: vi.fn()
}));

vi.mock('../userSessionCoordinator', () => ({
    runAvatarSwapFlow: vi.fn(),
    runFirstLoginFlow: vi.fn(),
    runHomeLocationSyncFlow: vi.fn(),
    runPostApplySyncFlow: vi.fn()
}));

vi.mock('../userEventCoordinator', () => ({
    runHandleUserUpdateFlow: vi.fn()
}));

vi.mock('../locationCoordinator', () => ({
    runUpdateCurrentUserLocationFlow: vi.fn()
}));

vi.mock('../friendPresenceCoordinator', () => ({
    runUpdateFriendFlow: vi.fn()
}));

vi.mock('../friendRelationshipCoordinator', () => ({
    userOnFriend: vi.fn()
}));

vi.mock('../groupCoordinator', () => ({
    handleGroupRepresented: vi.fn()
}));

vi.mock('../../stores/settings/appearance', () => ({
    useAppearanceSettingsStore: () => mocks.appearanceSettingsStore
}));

vi.mock('../../stores/settings/advanced', () => ({
    useAdvancedSettingsStore: () => mocks.advancedSettingsStore
}));

vi.mock('../../stores/auth', () => ({
    useAuthStore: () => ({})
}));

vi.mock('../../stores/avatar', () => ({
    useAvatarStore: () => ({})
}));

vi.mock('../../stores/favorite', () => ({
    useFavoriteStore: () => mocks.favoriteStore
}));

vi.mock('../../stores/friend', () => ({
    useFriendStore: () => mocks.friendStore
}));

vi.mock('../../stores/game', () => ({
    useGameStore: () => ({})
}));

vi.mock('../../stores/settings/general', () => ({
    useGeneralSettingsStore: () => ({})
}));

vi.mock('../../stores/instance', () => ({
    useInstanceStore: () => ({})
}));

vi.mock('../../stores/location', () => ({
    useLocationStore: () => mocks.locationStore
}));

vi.mock('../../stores/moderation', () => ({
    useModerationStore: () => mocks.moderationStore
}));

vi.mock('../../stores/notification', () => ({
    useNotificationStore: () => ({})
}));

vi.mock('../../stores/photon', () => ({
    usePhotonStore: () => ({})
}));

vi.mock('../../stores/search', () => ({
    useSearchStore: () => ({})
}));

vi.mock('../searchIndexCoordinator', () => ({
    syncFriendSearchIndex: vi.fn()
}));

vi.mock('../../stores/sharedFeed', () => ({
    useSharedFeedStore: () => ({})
}));

vi.mock('../../stores/ui', () => ({
    useUiStore: () => mocks.uiStore
}));

vi.mock('../../stores/user', () => ({
    useUserStore: () => mocks.userStore
}));

const sendIpc = vi.fn();

globalThis.AppApi = {
    SendIpc: (...args) => sendIpc(...args)
};

import { showSeededResoniteUserDialog } from '../userCoordinator';

describe('userCoordinator Resonite external dialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.friendStore.friends = new Map();
        mocks.userStore.currentUser.id = 'usr_self';
        mocks.userStore.currentUser.$resonitePresence = null;
        mocks.userStore.userDialog = {
            id: null,
            ref: null,
            friend: null,
            visible: false,
            loading: false,
            memo: '',
            note: '',
            avatars: [],
            worlds: [],
            users: [],
            instance: {
                ref: {},
                users: []
            }
        };
        mocks.userStore.showUserDialogHistory = new Set();
        mocks.uiStore.openDialog.mockReturnValue(false);
        mocks.getUserMemo.mockResolvedValue({
            userId: 'resonite:U-other',
            memo: ''
        });
        mocks.database.getUserStats.mockResolvedValue({
            userId: 'resonite:U-other',
            lastSeen: '',
            joinCount: 0,
            timeSpent: 0
        });
        mocks.database.getFriendLogHistoryForUserId.mockResolvedValue([]);
        mocks.fetchResoniteUserProfiles.mockResolvedValue(
            new Map([
                [
                    'U-other',
                    {
                        username: 'OtherUser',
                        profile: {
                            iconUrl: 'https://assets.resonite.com/icon',
                            tagline: 'Tagline',
                            description: 'Description'
                        }
                    }
                ]
            ])
        );
        mocks.mergeResoniteUserProfile.mockImplementation(
            (baseFriend, userProfile) => ({
                ...baseFriend,
                name: userProfile.username,
                ref: {
                    ...(baseFriend?.ref || {}),
                    displayName: userProfile.username,
                    profileImageUrl: userProfile.profile.iconUrl,
                    userIcon: userProfile.profile.iconUrl
                },
                resonite: {
                    ...(baseFriend?.resonite || {}),
                    username: userProfile.username,
                    profile: {
                        ...(baseFriend?.resonite?.profile || {}),
                        ...(userProfile.profile || {})
                    }
                }
            })
        );
    });

    test('opening a seeded non-contact Resonite profile does not add a sidebar friend entry', async () => {
        showSeededResoniteUserDialog({
            userId: 'U-other',
            displayName: 'OtherUser',
            state: 'online',
            sessionHash: 'S-hash',
            sessionName: 'Soft Sea of Stars'
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(mocks.friendStore.upsertResoniteFriend).not.toHaveBeenCalled();
        expect(mocks.friendStore.friends.has('resonite:U-other')).toBe(false);
        expect(mocks.userStore.userDialog.id).toBe('resonite:U-other');
        expect(mocks.userStore.userDialog.isFriend).toBe(false);
    });

    test('opening a seeded non-contact Resonite profile preserves forwarded session and profile fields', async () => {
        mocks.fetchResoniteUserProfiles.mockResolvedValue(
            new Map([
                [
                    'U-other',
                    {
                        username: 'OtherUser',
                        registrationDate: '2024-02-03T04:05:06.000Z',
                        profile: {
                            iconUrl: 'https://assets.resonite.com/icon',
                            tagline: 'Tagline',
                            description: 'Description'
                        }
                    }
                ]
            ])
        );
        mocks.mergeResoniteUserProfile.mockImplementation(
            (baseFriend, userProfile) => ({
                ...baseFriend,
                name: userProfile.username,
                ref: {
                    ...(baseFriend?.ref || {}),
                    displayName: userProfile.username,
                    profileImageUrl: userProfile.profile.iconUrl,
                    userIcon: userProfile.profile.iconUrl
                },
                resonite: {
                    ...(baseFriend?.resonite || {}),
                    username: userProfile.username,
                    registrationDate: userProfile.registrationDate,
                    profile: {
                        ...(baseFriend?.resonite?.profile || {}),
                        ...(userProfile.profile || {})
                    }
                }
            })
        );

        showSeededResoniteUserDialog({
            userId: 'U-other',
            displayName: 'OtherUser',
            state: 'online',
            sessionHash: 'S-hash',
            sessionName: 'Soft Sea of Stars',
            locationName: 'Soft Sea of Stars',
            registrationDate: '2024-01-02T03:04:05.000Z'
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(mocks.userStore.userDialog.id).toBe('resonite:U-other');
        expect(mocks.userStore.userDialog.ref.location).toBe(
            'Soft Sea of Stars'
        );
        expect(mocks.userStore.userDialog.ref.resonite).toEqual(
            expect.objectContaining({
                userId: 'U-other',
                currentSessionHash: 'S-hash',
                currentSessionName: 'Soft Sea of Stars',
                registrationDate: '2024-02-03T04:05:06.000Z'
            })
        );
    });
});
