import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
    toast: Object.assign(vi.fn(), {
        success: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn()
    }),
    router: {
        currentRoute: {
            __v_isRef: true,
            value: {
                name: '',
                path: '/'
            }
        },
        beforeEach: vi.fn(),
        afterEach: vi.fn(),
        push: vi.fn()
    },
    friendStore: {
        friends: new Map()
    },
    userStore: {
        currentUser: {
            id: 'usr_me',
            hasSharedConnectionsOptOut: false
        }
    },
    userRequest: {
        getMutualFriends: vi.fn()
    },
    database: {
        updateMutualsForFriend: vi.fn(),
        upsertMutualGraphMeta: vi.fn(),
        bulkUpsertMutualGraphMeta: vi.fn(),
        saveMutualGraphSnapshot: vi.fn()
    }
}));

vi.mock('vue-router', () => ({
    useRouter: () => mocks.router,
    createRouter: () => mocks.router,
    createWebHashHistory: () => ({})
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key) => key
    })
}));

vi.mock('vue-sonner', () => ({
    toast: mocks.toast
}));

vi.mock('@/plugins', () => ({
    i18n: {
        global: {
            t: (key) => key
        }
    }
}));

vi.mock('../../services/database', () => ({
    database: mocks.database
}));

vi.mock('../friend', () => ({
    useFriendStore: () => mocks.friendStore
}));

vi.mock('../user', () => ({
    useUserStore: () => mocks.userStore
}));

vi.mock('../../api', () => ({
    userRequest: mocks.userRequest
}));

import { useChartsStore } from '../charts';

describe('useChartsStore mutual network filtering', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mocks.friendStore.friends = new Map();
        mocks.userStore.currentUser = {
            id: 'usr_me',
            hasSharedConnectionsOptOut: false
        };
        mocks.userRequest.getMutualFriends.mockResolvedValue({
            json: []
        });
        mocks.database.bulkUpsertMutualGraphMeta.mockResolvedValue(undefined);
        mocks.database.saveMutualGraphSnapshot.mockResolvedValue(undefined);
        mocks.database.updateMutualsForFriend.mockResolvedValue(undefined);
        mocks.database.upsertMutualGraphMeta.mockResolvedValue(undefined);
    });

    test('fetchMutualGraph skips Resonite contacts in mixed-provider friend lists', async () => {
        mocks.friendStore.friends.set('usr_alpha', {
            id: 'usr_alpha',
            provider: 'vrchat',
            isExternal: false,
            ref: { id: 'usr_alpha', displayName: 'Alpha' }
        });
        mocks.friendStore.friends.set('resonite:u-beta', {
            id: 'resonite:u-beta',
            provider: 'resonite',
            isExternal: true,
            ref: { id: 'resonite:u-beta', displayName: 'Beta' }
        });

        const store = useChartsStore();
        await store.fetchMutualGraph();

        expect(mocks.userRequest.getMutualFriends).toHaveBeenCalledTimes(1);
        expect(mocks.userRequest.getMutualFriends).toHaveBeenCalledWith({
            userId: 'usr_alpha',
            offset: 0,
            n: 100
        });
        expect(store.mutualGraphStatus.friendSignature).toBe(1);
        expect(mocks.database.saveMutualGraphSnapshot).toHaveBeenCalledWith(
            expect.any(Map)
        );
        const savedEntries =
            mocks.database.saveMutualGraphSnapshot.mock.calls[0][0];
        expect(Array.from(savedEntries.keys())).toEqual(['usr_alpha']);
    });

    test('fetchSingleFriendMutuals ignores non-VRChat identifiers', async () => {
        const store = useChartsStore();

        const result = await store.fetchSingleFriendMutuals('resonite:u-beta');

        expect(result).toEqual({
            success: false,
            mutuals: [],
            optedOut: false
        });
        expect(mocks.userRequest.getMutualFriends).not.toHaveBeenCalled();
    });
});
