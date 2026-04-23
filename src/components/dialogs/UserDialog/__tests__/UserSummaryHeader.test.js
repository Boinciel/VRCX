import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { shallowMount } from '@vue/test-utils';

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
vi.mock('../../../../composables/useUserDisplay', () => ({
    useUserDisplay: () => ({
        userImage: vi.fn(() => ''),
        userStatusClass: vi.fn(() => '')
    })
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
                    template: '<div><slot /><slot name="content" /></div>'
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
});
