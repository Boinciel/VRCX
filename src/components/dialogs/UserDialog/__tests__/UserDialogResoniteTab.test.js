import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';

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

import UserDialogResoniteTab from '../UserDialogResoniteTab.vue';
import { useUserStore } from '../../../../stores';

function mountComponent(resonite = {}) {
    const pinia = createTestingPinia({
        stubActions: false
    });

    const userStore = useUserStore(pinia);
    userStore.$patch({
        userDialog: {
            ref: {
                resonite
            }
        }
    });

    return mount(UserDialogResoniteTab, {
        global: {
            plugins: [pinia]
        }
    });
}

describe('UserDialogResoniteTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders enriched profile metadata when available', () => {
        const wrapper = mountComponent({
            username: 'ContactOne',
            normalizedUsername: 'contactone',
            registrationDate: '2024-05-01T12:00:00.000Z',
            isVerified: true,
            tags: ['builder', 'featured'],
            profile: {
                tagline: 'Building worlds',
                description: 'Detailed profile'
            },
            realtime: {}
        });

        expect(wrapper.text()).toContain('Profile');
        expect(wrapper.text()).toContain('ContactOne');
        expect(wrapper.text()).toContain('contactone');
        expect(wrapper.text()).toContain('true');
        expect(wrapper.text()).toContain('Building worlds');
        expect(wrapper.text()).toContain('Detailed profile');
        expect(wrapper.text()).toContain('builder, featured');
    });

    test('renders fallback values when enriched profile metadata is missing', () => {
        const wrapper = mountComponent({ realtime: {} });

        expect(wrapper.text()).toContain('Profile');
        expect(wrapper.text()).toContain('Username');
        expect(wrapper.text()).toContain('Normalized Username');
        expect(wrapper.text()).toContain('Registered');
    });
});
