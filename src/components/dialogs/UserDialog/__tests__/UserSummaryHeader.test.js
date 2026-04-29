import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { shallowMount } from '@vue/test-utils';

const mockFetchResoniteInventoryRecordByPath = vi.fn();

vi.mock('vue-i18n', () => {
    const { ref } = require('vue');
    return {
        useI18n: () => ({
            t: (key, params) =>
                params ? `${key}:${JSON.stringify(params)}` : key,
            locale: ref('en')
        }),
        createI18n: () => ({
            global: { t: (key) => key, locale: ref('en') },
            install: vi.fn()
        })
    };
});

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
    return Object.assign({}, actual, {
        useRouter: vi.fn(() => ({
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} })
        }))
    });
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
vi.mock('../../../../composables/useUserDisplay', () => ({
    useUserDisplay: () => ({
        userImage: vi.fn(() => ''),
        userStatusClass: vi.fn(() => '')
    })
}));
vi.mock('../../../../services/resoniteInventory', () => ({
    fetchResoniteInventoryRecordByPath: (...args) =>
        mockFetchResoniteInventoryRecordByPath(...args)
}));

import UserSummaryHeader from '../UserSummaryHeader.vue';
import { useUserStore } from '../../../../stores';

function mountComponent(overrides = {}) {
    const pinia = createTestingPinia({
        stubActions: false
    });

    const userStore = useUserStore(pinia);
    userStore.$patch({
        userDialog: {
            id: 'resonite:U-1mNv2U0ss6a',
            loading: false,
            previousDisplayNames: [],
            mutualFriendCount: 0,
            isExternal: true,
            isFriend: false,
            friend: null,
            ref: {
                id: 'resonite:U-1mNv2U0ss6a',
                displayName: 'resonite:U-1mNv2U0ss6a',
                status: '',
                pronouns: '',
                $languages: [],
                badges: [],
                currentAvatarThumbnailImageUrl: '',
                currentAvatarImageUrl: '',
                profilePicOverrideThumbnail: '',
                profilePicOverride: '',
                userIcon: '',
                statusDescription: '',
                discordId: '',
                $platform: '',
                $customTag: '',
                resonite: {
                    userId: 'U-1mNv2U0ss6a',
                    username: 'ExampleUser'
                },
                ...overrides.ref
            },
            ...overrides.userDialog
        },
        currentUser: {
            id: 'usr_me',
            username: 'Me',
            ...overrides.currentUser
        }
    });

    return shallowMount(UserSummaryHeader, {
        props: {
            getUserStateText: () => '',
            copyUserDisplayName: overrides.copyUserDisplayName || vi.fn(),
            toggleBadgeVisibility: vi.fn(),
            toggleBadgeShowcased: vi.fn(),
            userDialogCommand: vi.fn()
        },
        global: {
            plugins: [pinia],
            stubs: {
                TooltipWrapper: {
                    props: ['content'],
                    template:
                        '<div><slot /><span>{{ content }}</span><slot name="content" /></div>'
                },
                UserActionDropdown: true,
                Popover: { template: '<div><slot /></div>' },
                PopoverTrigger: { template: '<div><slot /></div>' },
                PopoverContent: { template: '<div><slot /></div>' },
                Badge: { template: '<div><slot /></div>' },
                Checkbox: true
            }
        }
    });
}

describe('UserSummaryHeader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchResoniteInventoryRecordByPath.mockResolvedValue(null);
    });

    test('prefers the Resonite username over the synthetic id in the header', async () => {
        const copyUserDisplayName = vi.fn();
        const wrapper = mountComponent({ copyUserDisplayName });

        expect(wrapper.text()).toContain('ExampleUser');
        expect(wrapper.text()).not.toContain('resonite:U-1mNv2U0ss6a');

        await wrapper.find('.font-bold').trigger('click');

        expect(copyUserDisplayName).toHaveBeenCalledWith('ExampleUser');
    });

    test('shows the ReCon badge when the status describes ReCon', () => {
        const wrapper = mountComponent({
            ref: {
                statusDescription: 'Online on version 0.12.1-beta of ReCon',
                resonite: {
                    userId: 'U-1mNv2U0ss6a',
                    username: 'ExampleUser'
                }
            }
        });

        expect(wrapper.text()).toContain('ReCon');
    });

    test('renders Resonite resolved badges in the header badge strip', () => {
        const wrapper = mountComponent({
            ref: {
                resonite: {
                    userId: 'U-1mNv2U0ss6a',
                    username: 'ExampleUser',
                    tags: ['potato'],
                    profile: {
                        displayBadges: [
                            {
                                id: 'custom-1',
                                ownerId: 'U-custom',
                                enabled: true,
                                name: 'Custom Contributor',
                                assetUrl:
                                    'resdb:///0123456789abcdef0123456789abcdef.png'
                            }
                        ]
                    }
                }
            }
        });

        const resoniteBadgeImages = wrapper
            .findAll('img')
            .map((node) => node.attributes('src') || '')
            .filter((src) => src.startsWith('https://assets.resonite.com/'));

        expect(resoniteBadgeImages).toHaveLength(2);
        expect(
            resoniteBadgeImages.some((src) =>
                src.includes('0123456789abcdef0123456789abcdef')
            )
        ).toBe(true);
        expect(
            resoniteBadgeImages.some((src) =>
                src.includes(
                    'adf9ba7eee98dfa36e8fcf4130f2d6e60d353566c9f315c0f28a000dd06cad2c'
                )
            )
        ).toBe(true);
    });

    test('renders a single square profile image for external users', () => {
        const avatarUrl = 'https://example.com/resonite-avatar.png';
        const wrapper = mountComponent({
            ref: {
                currentAvatarThumbnailImageUrl: avatarUrl,
                currentAvatarImageUrl: avatarUrl,
                profilePicOverrideThumbnail: avatarUrl,
                profilePicOverride: avatarUrl,
                userIcon: avatarUrl,
                resonite: {
                    userId: 'U-1mNv2U0ss6a',
                    username: 'ExampleUser'
                }
            }
        });

        const avatarImages = wrapper.findAll(`img[src="${avatarUrl}"]`);

        expect(avatarImages).toHaveLength(1);
        expect(avatarImages[0].attributes('style')).toContain('width: 120px;');
        expect(avatarImages[0].attributes('style')).toContain('height: 120px;');
    });

    test('prefers the resolved badge label over the raw tag in tooltip content', () => {
        const wrapper = mountComponent({
            ref: {
                resonite: {
                    userId: 'U-1mNv2U0ss6a',
                    username: 'ExampleUser',
                    tags: ['vfe22']
                }
            }
        });

        expect(wrapper.text()).toContain('Virtual Furnal Equinox 2022');
        expect(wrapper.text()).not.toContain('vfe22');
    });

    test('resolves custom 3D inventory badges into rendered thumbnail badges', async () => {
        mockFetchResoniteInventoryRecordByPath.mockResolvedValue({
            id: 'R-honeybee',
            ownerId: 'G-Resonite',
            name: 'TheHoneybee',
            path: 'Inventory\\3D_Badges\\Patreon',
            assetUri: 'resdb:///0123456789abcdef0123456789abcdef.png',
            thumbnailUrl:
                'https://assets.resonite.com/fedcba9876543210fedcba9876543210'
        });

        const wrapper = mountComponent({
            ref: {
                resonite: {
                    userId: 'U-1mNv2U0ss6a',
                    username: 'ExampleUser',
                    profile: {
                        displayBadges: [
                            {
                                id: 'custom 3D badge:G-Resonite/Inventory/3D_Badges/Patreon/TheHoneybee',
                                name: 'Custom 3D Badge',
                                badgeType: '3D'
                            }
                        ]
                    }
                }
            }
        });

        await vi.waitFor(() => {
            expect(mockFetchResoniteInventoryRecordByPath).toHaveBeenCalledWith(
                {
                    userId: 'U-1mNv2U0ss6a',
                    ownerId: 'G-Resonite',
                    path: 'Inventory\\3D_Badges\\Patreon\\TheHoneybee'
                }
            );
        });

        await vi.waitFor(() => {
            const resoniteBadgeImages = wrapper
                .findAll('img')
                .map((node) => node.attributes('src') || '');

            expect(resoniteBadgeImages).toContain(
                'https://assets.resonite.com/fedcba9876543210fedcba9876543210'
            );
        });
    });
});
