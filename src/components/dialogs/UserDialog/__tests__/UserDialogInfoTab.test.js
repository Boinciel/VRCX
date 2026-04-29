import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { flushPromises, shallowMount } from '@vue/test-utils';

const mockFetchResoniteUserProfiles = vi.fn();
const mockShowUserDialog = vi.fn();
const mockShowSeededResoniteUserDialog = vi.fn();

vi.mock('vue-i18n', () => ({
    useI18n: () => {
        const { ref } = require('vue');
        return {
            t: (key, params) =>
                params ? `${key}:${JSON.stringify(params)}` : key,
            locale: ref('en')
        };
    },
    createI18n: () => ({
        global: { t: (key) => key },
        install: vi.fn()
    })
}));

vi.mock('../../../../plugins/router', () => {
    const { ref } = require('vue');
    return {
        router: {
            beforeEach: vi.fn(),
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} }),
            isReady: vi.fn().mockResolvedValue(true)
        },
        initRouter: vi.fn()
    };
});

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal();
    const { ref } = require('vue');
    return {
        ...actual,
        useRouter: vi.fn(() => ({
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} })
        }))
    };
});

vi.mock('../../../../plugins/interopApi', () => ({ initInteropApi: vi.fn() }));
vi.mock('../../../../services/database', () => ({
    database: new Proxy(
        {},
        {
            get: (_target, prop) => {
                if (prop === '__esModule') return false;
                return vi.fn().mockResolvedValue(null);
            }
        }
    )
}));

vi.mock('../../../../services/config', () => ({
    default: {
        init: vi.fn(),
        getString: vi.fn().mockImplementation((_k, d) => d ?? '{}'),
        setString: vi.fn(),
        getBool: vi.fn().mockImplementation((_k, d) => d ?? false),
        setBool: vi.fn(),
        getInt: vi.fn().mockImplementation((_k, d) => d ?? 0),
        setInt: vi.fn(),
        getFloat: vi.fn().mockImplementation((_k, d) => d ?? 0),
        setFloat: vi.fn(),
        getObject: vi.fn().mockReturnValue(null),
        setObject: vi.fn(),
        getArray: vi.fn().mockReturnValue([]),
        setArray: vi.fn(),
        remove: vi.fn()
    }
}));

vi.mock('../../../../services/jsonStorage', () => ({ default: vi.fn() }));
vi.mock('../../../../services/watchState', () => ({
    watchState: { isLoggedIn: false }
}));
vi.mock('../../../../services/request', () => ({
    request: vi.fn().mockResolvedValue({ json: {} }),
    processBulk: vi.fn(),
    buildRequestInit: vi.fn(),
    parseResponse: vi.fn(),
    shouldIgnoreError: vi.fn(),
    $throw: vi.fn(),
    failedGetRequests: new Map()
}));

vi.mock('../../../../services/resoniteRealtime', () => ({
    getResoniteSessionByHash: vi.fn(),
    refreshResoniteSessionByHash: vi.fn(),
    resoniteSessionCacheVersion: { value: 0 }
}));

vi.mock('../../../../coordinators/userCoordinator', () => ({
    showUserDialog: (...args) => mockShowUserDialog(...args),
    showSeededResoniteUserDialog: (...args) =>
        mockShowSeededResoniteUserDialog(...args)
}));

import UserDialogInfoTab from '../UserDialogInfoTab.vue';
import { miscRequest } from '../../../../api';
import {
    useAdvancedSettingsStore,
    useAppearanceSettingsStore,
    useFriendStore,
    useLocationStore,
    useModalStore,
    useUserStore
} from '../../../../stores';
import {
    getResoniteSessionByHash,
    refreshResoniteSessionByHash
} from '../../../../services/resoniteRealtime';

const fallbackAppApiMethods = new Map();

globalThis.AppApi = new Proxy(
    {
        ...(globalThis.AppApi || {}),
        OpenLink: vi.fn(),
        SetTrayIconNotification: vi.fn(),
        GetVersion: vi.fn().mockResolvedValue('0.0.0')
    },
    {
        get(target, prop, receiver) {
            if (Reflect.has(target, prop)) {
                return Reflect.get(target, prop, receiver);
            }

            if (!fallbackAppApiMethods.has(prop)) {
                fallbackAppApiMethods.set(prop, vi.fn());
            }

            return fallbackAppApiMethods.get(prop);
        }
    }
);

/**
 *
 * @param overrides
 */
function mountComponent(overrides = {}) {
    const pinia = createTestingPinia({
        stubActions: true
    });

    const appearanceSettingsStore = useAppearanceSettingsStore(pinia);
    appearanceSettingsStore.$patch({
        hideUserNotes: false,
        hideUserMemos: false
    });

    const advancedSettingsStore = useAdvancedSettingsStore(pinia);
    advancedSettingsStore.$patch({
        bioLanguage: 'en',
        translationApi: '',
        translationApiType: 'google',
        resoniteApiKey: 'U-test:session-token'
    });
    const advancedSettings = advancedSettingsStore;
    advancedSettings.translateText = vi.fn().mockResolvedValue('');

    const userStore = useUserStore(pinia);
    userStore.$patch({
        userDialog: {
            id: 'usr_target',
            friend: {
                state: 'online',
                ref: {
                    location: 'wrld_test:123'
                }
            },
            ref: {
                id: 'usr_target',
                location: 'wrld_test:123',
                travelingToLocation: '',
                profilePicOverride: '',
                currentAvatarImageUrl: '',
                currentAvatarTags: [],
                bio: '',
                bioLinks: [],
                state: 'online',
                $online_for: 1000,
                last_login: '2025-01-01T00:00:00.000Z',
                last_activity: '2025-01-01T00:00:00.000Z',
                date_joined: '2020-01-01',
                allowAvatarCopying: true,
                displayName: 'Target'
            },
            $location: {
                tag: 'wrld_test:123',
                shortName: 'Test',
                userId: '',
                user: null
            },
            instance: {
                ref: {},
                friendCount: 0
            },
            users: [
                {
                    id: 'usr_friend_1',
                    displayName: 'Friend A',
                    $userColour: '#ffffff',
                    location: 'traveling',
                    $travelingToTime: Date.now(),
                    $location_at: Date.now()
                }
            ],
            note: '',
            memo: '',
            isRepresentedGroupLoading: false,
            representedGroup: null,
            lastSeen: '2025-01-01T00:00:00.000Z',
            joinCount: 0,
            timeSpent: 0,
            dateFriendedInfo: [],
            unFriended: false,
            dateFriended: '2025-01-01T00:00:00.000Z',
            $homeLocationName: '',
            ...overrides.userDialog
        },
        currentUser: {
            id: 'usr_me',
            allowAvatarCopying: true,
            isBoopingEnabled: true,
            hasSharedConnectionsOptOut: false,
            hasDiscordFriendsOptOut: false,
            homeLocation: '',
            ...overrides.currentUser
        }
    });

    const locationStore = useLocationStore(pinia);
    locationStore.$patch({
        lastLocation: {
            location: 'wrld_test:123'
        }
    });

    const modal = useModalStore(pinia);
    modal.confirm = vi.fn().mockResolvedValue({ ok: false });

    const friendStore = useFriendStore(pinia);
    friendStore.friends.clear();
    for (const [friendKey, friendValue] of overrides.friendsEntries || []) {
        friendStore.friends.set(friendKey, friendValue);
    }

    return shallowMount(UserDialogInfoTab, {
        global: {
            plugins: [pinia],
            stubs: {
                Location: true,
                Timer: true,
                DropdownMenu: {
                    template: '<div><slot /></div>'
                },
                DropdownMenuTrigger: {
                    template: '<div><slot /></div>'
                },
                DropdownMenuContent: {
                    template: '<div><slot /></div>'
                },
                DropdownMenuItem: {
                    template:
                        '<button data-testid="dropdown-menu-item" @click="$emit(\'click\')"><slot /></button>',
                    emits: ['click']
                },
                TooltipWrapper: {
                    template: '<div><slot /><slot name="content" /></div>'
                },

                AvatarInfo: true
            }
        }
    });
}

describe('UserDialogInfoTab.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getResoniteSessionByHash).mockReturnValue(null);
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockResolvedValue(undefined)
            }
        });
        globalThis.AppApi.OpenLink.mockReset();
        globalThis.AppApi.SetTrayIconNotification.mockReset();
        globalThis.AppApi.GetVersion.mockResolvedValue('0.0.0');
        fallbackAppApiMethods.clear();
        mockShowUserDialog.mockReset();
        mockShowSeededResoniteUserDialog.mockReset();
    });

    describe('unit behavior', () => {
        test('onTabActivated fetches VRChat credits only once after first success', async () => {
            const creditsSpy = vi
                .spyOn(miscRequest, 'getVRChatCredits')
                .mockResolvedValue({ json: { balance: 42 } });
            const wrapper = mountComponent();

            wrapper.vm.onTabActivated();
            await flushPromises();
            wrapper.vm.onTabActivated();
            await flushPromises();

            expect(creditsSpy).toHaveBeenCalledTimes(0);
        });

        test('refreshResoniteSessionInfo only refreshes the current session cache', async () => {
            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            userId: 'U-host',
                            currentSessionHash: 'S-hash'
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                }
            });

            await wrapper.vm.refreshResoniteSessionInfo();

            const friendStore = useFriendStore();
            expect(friendStore.refreshResoniteFriends).not.toHaveBeenCalled();
            expect(refreshResoniteSessionByHash).toHaveBeenCalledWith({
                sessionHash: 'S-hash',
                userId: 'U-host',
                apiKey: 'U-test:session-token',
                force: true
            });
        });

        test('openResoniteSession falls back to a session deeplink when sessionURLs are missing', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-public',
                name: 'Soft Sea of Stars',
                sessionURLs: [],
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    friend: {
                        state: 'online',
                        ref: {
                            location: 'Soft Sea of Stars'
                        }
                    },
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            currentSessionHash: 'S-hash'
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            wrapper.vm.openResoniteSession();

            expect(globalThis.AppApi.OpenLink).toHaveBeenCalledWith(
                'resonite://session/S-public'
            );
        });

        test('renders the Resonite session title from world metadata when the session payload has no top-level name', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-public',
                accessLevel: 'contacts',
                world: {
                    name: 'Soft Sea of Stars'
                },
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    friend: {
                        state: 'online',
                        ref: {
                            location: ''
                        }
                    },
                    ref: {
                        id: 'resonite:U-host',
                        location: '',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName: ''
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            expect(wrapper.html()).toContain('Soft Sea of Stars - Contacts');
        });

        test('renders the Resonite session title for a seeded non-contact external user', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-public',
                accessLevel: 'registeredusers',
                world: {
                    name: 'Soft Sea of Stars'
                },
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-other',
                    isExternal: true,
                    friend: null,
                    ref: {
                        id: 'resonite:U-other',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            userId: 'U-other',
                            currentSessionHash: 'S-hash',
                            currentSessionName: 'Soft Sea of Stars',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'OtherUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            expect(wrapper.html()).toContain('Soft Sea of Stars - Registered');
        });

        test('openResoniteSessionUserDialog seeds session metadata for non-contact participants', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-public',
                name: 'Soft Sea of Stars',
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                }
            });

            wrapper.vm.openResoniteSessionUserDialog({
                userID: 'U-other',
                username: 'OtherUser',
                isPresent: true
            });

            expect(mockShowSeededResoniteUserDialog).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'U-other',
                    state: 'online',
                    locationName: 'Soft Sea of Stars',
                    sessionHash: 'S-hash',
                    sessionName: 'Soft Sea of Stars',
                    sessionId: 'S-public'
                })
            );
            const friendStore = useFriendStore();
            expect(friendStore.upsertResoniteFriend).not.toHaveBeenCalled();
        });

        test('seeded participant click-through does not create a sidebar friend entry', () => {
            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                },
                friendsEntries: [
                    [
                        'resonite:U-contact',
                        {
                            id: 'resonite:U-contact',
                            name: 'KnownContact',
                            provider: 'resonite',
                            isExternal: true,
                            ref: { displayName: 'KnownContact' }
                        }
                    ]
                ]
            });

            const friendStore = useFriendStore();
            const initialKeys = Array.from(friendStore.friends.keys());

            wrapper.vm.openResoniteSessionUserDialog({
                userID: 'U-other',
                username: 'OtherUser',
                isPresent: true
            });

            expect(Array.from(friendStore.friends.keys())).toEqual(initialKeys);
            expect(friendStore.friends.has('resonite:U-other')).toBe(false);
            expect(mockShowSeededResoniteUserDialog).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'U-other' })
            );
        });

        test('openResoniteSessionUserDialog does not mark non-host absent participants offline', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-public',
                hostUserId: 'U-host',
                name: 'Soft Sea of Stars',
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                }
            });

            wrapper.vm.openResoniteSessionUserDialog({
                userID: 'U-other',
                username: 'OtherUser',
                isPresent: false
            });

            expect(mockShowSeededResoniteUserDialog).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'U-other',
                    state: '',
                    status: ''
                })
            );
        });

        test('openResoniteSessionUserDialog keeps offline only for an absent host', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-public',
                hostUserId: 'U-host',
                name: 'Soft Sea of Stars',
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'HostUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                }
            });

            wrapper.vm.openResoniteSessionUserDialog({
                userID: 'U-host',
                username: 'HostUser',
                isPresent: false
            });

            expect(mockShowSeededResoniteUserDialog).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'U-host',
                    state: 'offline'
                })
            );
        });
    });

    describe('dom rendering', () => {
        test('renders imported InstanceActionBar and Spinner components when conditions are met', () => {
            const wrapper = mountComponent();

            expect(wrapper.find('instance-action-bar-stub').exists()).toBe(
                true
            );
            expect(wrapper.find('spinner-stub').exists()).toBe(true);
        });

        test('renders Resonite session host separately from other participants', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                name: '<color=blue>TMSC<color=purple> Zutyo <color=red>Home',
                hostUserId: 'U-host',
                hostUsername: 'CreatorUser',
                joinedUsers: 3,
                maxUsers: 16,
                sessionURLs: ['resonite://session'],
                sessionUsers: [
                    {
                        userID: 'U-host',
                        username: 'CreatorUser',
                        isPresent: true
                    },
                    {
                        userID: 'U-other',
                        username: 'OtherUser',
                        isPresent: true
                    },
                    {
                        userID: 'U-guest',
                        username: 'GuestUser',
                        isPresent: false
                    }
                ]
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    friend: {
                        state: 'online',
                        ref: {
                            location:
                                '<color=blue>TMSC<color=purple> Zutyo <color=red>Home'
                        }
                    },
                    ref: {
                        id: 'resonite:U-host',
                        location:
                            '<color=blue>TMSC<color=purple> Zutyo <color=red>Home',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName:
                                '<color=blue>TMSC<color=purple> Zutyo <color=red>Home'
                        },
                        state: 'online',
                        displayName: 'CreatorUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                },
                friendsEntries: [
                    [
                        'resonite:U-host',
                        {
                            id: 'resonite:U-host',
                            name: 'CreatorUser',
                            ref: { $userColour: '#00f', location: 'Somewhere' }
                        }
                    ],
                    [
                        'resonite:U-guest',
                        {
                            id: 'resonite:U-guest',
                            name: 'GuestUser',
                            ref: { $userColour: '#0f0', location: 'Somewhere' }
                        }
                    ]
                ]
            });

            expect(wrapper.text()).toContain('Host');
            expect(wrapper.text()).not.toContain(
                'dialog.user.info.instance_creator'
            );
            expect(wrapper.html()).toContain(
                'cef8313f2418512a52c718a505c8882684dfa6556bdf2af1da655d3e6a0f878e'
            );
            expect(wrapper.text()).toContain('GuestUser');
            expect(wrapper.text()).toContain('OtherUser');
            expect(wrapper.text()).toContain('3 /16');
            expect(wrapper.text().match(/CreatorUser/g) || []).toHaveLength(1);
            expect(wrapper.text().indexOf('GuestUser')).toBeLessThan(
                wrapper.text().indexOf('OtherUser')
            );
        });

        test('renders the Resonite color icon beside the session title', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                name: 'Soft Sea of Stars',
                accessLevel: 'anyone',
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    friend: {
                        state: 'online',
                        ref: {
                            location: 'Soft Sea of Stars'
                        }
                    },
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'CreatorUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            const imageSources = wrapper
                .findAll('img')
                .map((node) => node.attributes('src'));

            expect(imageSources).toContain('/images/resonite/resonite_color.svg');
        });

        test('counts the viewed Resonite contact when they are present in the session', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                hostUserId: 'U-host',
                hostUsername: 'CreatorUser',
                joinedUsers: 3,
                sessionUsers: [
                    {
                        userID: 'U-host',
                        username: 'CreatorUser',
                        isPresent: true
                    },
                    {
                        userID: 'U-friend',
                        username: 'FriendUser',
                        isPresent: true
                    },
                    {
                        userID: 'U-third',
                        username: 'ThirdUser',
                        isPresent: true
                    }
                ]
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-host',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-host',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            userId: 'U-host',
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'CreatorUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                },
                friendsEntries: [
                    [
                        'resonite:U-host',
                        {
                            id: 'resonite:U-host',
                            name: 'CreatorUser',
                            ref: { location: 'Soft Sea of Stars' }
                        }
                    ],
                    [
                        'resonite:U-friend',
                        {
                            id: 'resonite:U-friend',
                            name: 'FriendUser',
                            ref: { location: 'Soft Sea of Stars' }
                        }
                    ],
                    [
                        'resonite:U-third',
                        {
                            id: 'resonite:U-third',
                            name: 'ThirdUser',
                            ref: { location: 'Soft Sea of Stars' }
                        }
                    ]
                ]
            });

            expect(wrapper.vm.resoniteContactsInWorldCount).toBe(3);
        });

        test('only counts present Resonite contacts in the session total', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                hostUserId: 'U-host',
                hostUsername: 'CreatorUser',
                joinedUsers: 3,
                sessionUsers: [
                    {
                        userID: 'U-host',
                        username: 'CreatorUser',
                        isPresent: true
                    },
                    {
                        userID: 'U-friend',
                        username: 'FriendUser',
                        isPresent: true
                    },
                    { userID: 'U-away', username: 'AwayUser', isPresent: false }
                ]
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-viewed',
                    isExternal: true,
                    ref: {
                        id: 'resonite:U-viewed',
                        location: 'Soft Sea of Stars',
                        resonite: {
                            userId: 'U-viewed',
                            currentSessionHash: 'S-hash',
                            locationName: 'Soft Sea of Stars'
                        },
                        state: 'online',
                        displayName: 'ViewedUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    }
                },
                friendsEntries: [
                    [
                        'resonite:U-host',
                        {
                            id: 'resonite:U-host',
                            name: 'CreatorUser',
                            ref: { location: 'Soft Sea of Stars' }
                        }
                    ],
                    [
                        'resonite:U-friend',
                        {
                            id: 'resonite:U-friend',
                            name: 'FriendUser',
                            ref: { location: 'Soft Sea of Stars' }
                        }
                    ],
                    [
                        'resonite:U-away',
                        {
                            id: 'resonite:U-away',
                            name: 'AwayUser',
                            ref: { location: 'Soft Sea of Stars' }
                        }
                    ]
                ]
            });

            expect(wrapper.vm.resoniteContactsInWorldCount).toBe(2);
        });

        test('keeps the VRChat instance creator label without the Resonite host badge', () => {
            const wrapper = mountComponent({
                userDialog: {
                    isExternal: false,
                    ref: {
                        id: 'usr_target',
                        location: 'wrld_test:123',
                        travelingToLocation: '',
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        bio: '',
                        bioLinks: [],
                        state: 'online',
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true,
                        displayName: 'Target'
                    },
                    $location: {
                        tag: 'wrld_test:123',
                        shortName: 'Test',
                        userId: 'usr_creator',
                        user: {
                            id: 'usr_creator',
                            displayName: 'VRC Creator',
                            $userColour: '#ffffff'
                        }
                    },
                    users: []
                }
            });

            expect(wrapper.text()).toContain(
                'dialog.user.info.instance_creator'
            );
            expect(wrapper.html()).not.toContain(
                'cef8313f2418512a52c718a505c8882684dfa6556bdf2af1da655d3e6a0f878e'
            );
        });

        test('hides Resonite action buttons for private sessions', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                name: 'Private Session',
                accessLevel: 'private',
                sessionURLs: ['resonite://private-session'],
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-private',
                    isExternal: true,
                    friend: {
                        state: 'online',
                        ref: {
                            location: 'Private'
                        }
                    },
                    ref: {
                        id: 'resonite:U-private',
                        location: 'Private',
                        state: 'online',
                        displayName: 'PrivateUser',
                        resonite: {
                            currentSessionHash: 'S-private',
                            locationName: 'Private'
                        },
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            expect(wrapper.html()).not.toContain('log-in-stub');
            expect(wrapper.html()).not.toContain('refresh-cw-stub');
            expect(wrapper.html()).not.toContain('users-round-stub');
            expect(wrapper.html()).not.toContain('user-plus2-stub');
        });

        test('hides Resonite action buttons for offline users even with stale location data', () => {
            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-offline',
                    isExternal: true,
                    friend: {
                        state: 'offline',
                        ref: {
                            location: 'Some Old World'
                        }
                    },
                    ref: {
                        id: 'resonite:U-offline',
                        location: 'Some Old World',
                        state: 'offline',
                        displayName: 'OfflineUser',
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            expect(wrapper.html()).not.toContain('log-in-stub');
            expect(wrapper.html()).not.toContain('refresh-cw-stub');
            expect(wrapper.html()).not.toContain('users-round-stub');
            expect(wrapper.html()).not.toContain('user-plus2-stub');
        });

        test('shows Resonite action buttons for offline users when the session is known', () => {
            vi.mocked(getResoniteSessionByHash).mockReturnValue({
                sessionId: 'S-headless',
                name: 'Headless Lounge',
                sessionURLs: ['resonite://session/headless'],
                sessionUsers: []
            });

            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-headless',
                    isExternal: true,
                    friend: {
                        state: 'offline',
                        ref: {
                            location: 'Headless Lounge'
                        }
                    },
                    ref: {
                        id: 'resonite:U-headless',
                        location: 'Headless Lounge',
                        state: 'offline',
                        displayName: 'HeadlessHost',
                        resonite: {
                            currentSessionHash: 'S-headless-hash',
                            locationName: 'Headless Lounge'
                        },
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-01T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: true
                    },
                    $location: null,
                    users: []
                }
            });

            expect(wrapper.html()).toContain(
                'dialog.user.info.launch_invite_tooltip'
            );
            expect(wrapper.html()).toContain(
                'dialog.user.info.refresh_instance_info'
            );
        });

        test('hides VRChat-only info fields for Resonite contacts while keeping useful stats', () => {
            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-contact',
                    isExternal: true,
                    friend: {
                        state: 'offline',
                        ref: {
                            location: 'Offline'
                        }
                    },
                    ref: {
                        id: 'resonite:U-contact',
                        location: 'Offline',
                        state: 'offline',
                        displayName: 'Resonite Contact',
                        resonite: {
                            userId: 'U-contact'
                        },
                        bio: 'Ignored bio',
                        bioLinks: ['https://example.com'],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: '',
                        $offline_for: Date.now() - 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-02T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: false
                    },
                    representedGroup: {
                        isRepresenting: false
                    },
                    lastSeen: '2025-01-03T00:00:00.000Z',
                    joinCount: 4,
                    timeSpent: 7200000,
                    dateFriended: '2025-01-04T00:00:00.000Z'
                }
            });

            expect(wrapper.text()).not.toContain(
                'dialog.user.info.avatar_info'
            );
            expect(wrapper.text()).toContain('U-contact');
            expect(wrapper.text()).not.toContain('resonite:U-contact');
            expect(wrapper.text()).not.toContain(
                'dialog.user.info.represented_group'
            );
            expect(wrapper.text()).not.toContain('dialog.user.info.bio');
            expect(wrapper.text()).not.toContain(
                'dialog.user.info.avatar_cloning'
            );
            expect(wrapper.text()).toContain('dialog.user.info.last_seen');
            expect(wrapper.text()).toContain('dialog.user.info.join_count');
            expect(wrapper.text()).toContain('dialog.user.info.time_together');
            expect(wrapper.text()).toContain('dialog.user.info.offline_for');
            expect(wrapper.text()).toContain('dialog.user.info.last_activity');
            expect(wrapper.text()).not.toContain('dialog.user.info.friended');
        });

        test('copies the stripped Resonite user id from the info screen', async () => {
            const wrapper = mountComponent({
                userDialog: {
                    id: 'resonite:U-contact',
                    isExternal: true,
                    friend: {
                        state: 'offline',
                        ref: {
                            location: 'Offline'
                        }
                    },
                    ref: {
                        id: 'resonite:U-contact',
                        location: 'Offline',
                        state: 'offline',
                        displayName: 'Resonite Contact',
                        resonite: {
                            userId: 'U-contact'
                        },
                        bio: '',
                        bioLinks: [],
                        profilePicOverride: '',
                        currentAvatarImageUrl: '',
                        currentAvatarTags: [],
                        $online_for: '',
                        $offline_for: Date.now() - 1000,
                        last_login: '2025-01-01T00:00:00.000Z',
                        last_activity: '2025-01-02T00:00:00.000Z',
                        date_joined: '2020-01-01',
                        allowAvatarCopying: false
                    },
                    representedGroup: {
                        isRepresenting: false
                    }
                }
            });

            const copyIdButton = wrapper
                .findAll('[data-testid="dropdown-menu-item"]')
                .find((node) =>
                    node.text().includes('dialog.user.info.copy_id')
                );

            expect(copyIdButton).toBeTruthy();

            await copyIdButton.trigger('click');
            await flushPromises();

            expect(
                globalThis.navigator.clipboard.writeText
            ).toHaveBeenCalledWith('U-contact');
        });
    });
});
