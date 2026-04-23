import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
    lookupFeedDatabase: vi.fn(),
    searchFeedDatabase: vi.fn(),
    getString: vi.fn(),
    getBool: vi.fn(),
    setString: vi.fn(),
    setBool: vi.fn(),
    userStore: {
        currentUser: {
            $resonitePresence: {
                linkedContactId: 'resonite:U-self',
                linkedUserId: 'U-self'
            }
        }
    },
    friendStore: {
        localFavoriteFriends: new Set()
    },
    vrcxStore: {
        searchLimit: 50,
        maxTableSize: 100
    },
    watchState: {
        isLoggedIn: true,
        isFavoritesLoaded: false
    }
}));

vi.mock('../../services/database', () => ({
    database: {
        lookupFeedDatabase: mocks.lookupFeedDatabase,
        searchFeedDatabase: mocks.searchFeedDatabase
    }
}));

vi.mock('../../services/config', () => ({
    default: {
        getString: mocks.getString,
        getBool: mocks.getBool,
        setString: mocks.setString,
        setBool: mocks.setBool
    }
}));

vi.mock('../friend', () => ({
    useFriendStore: () => mocks.friendStore
}));

vi.mock('../user', () => ({
    useUserStore: () => mocks.userStore
}));

vi.mock('../vrcx', () => ({
    useVrcxStore: () => mocks.vrcxStore
}));

vi.mock('../../services/watchState', () => ({
    watchState: mocks.watchState
}));

import { useFeedStore } from '../feed';

describe('useFeedStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        mocks.getString.mockResolvedValue('[]');
        mocks.getBool.mockResolvedValue(false);
        mocks.setString.mockResolvedValue(undefined);
        mocks.setBool.mockResolvedValue(undefined);
        mocks.lookupFeedDatabase.mockResolvedValue([]);
        mocks.searchFeedDatabase.mockResolvedValue([]);
        mocks.userStore.currentUser.$resonitePresence = {
            linkedContactId: 'resonite:U-self',
            linkedUserId: 'U-self'
        };
    });

    test('filters the logged-in Resonite self-contact from DB-backed feed lookups', async () => {
        mocks.lookupFeedDatabase.mockResolvedValue([
            {
                type: 'GPS',
                userId: 'resonite:U-self',
                displayName: 'Current Self',
                created_at: '2026-04-22T00:00:00.000Z'
            },
            {
                type: 'GPS',
                userId: 'resonite:U-friend',
                displayName: 'Contact',
                created_at: '2026-04-22T00:01:00.000Z'
            }
        ]);

        const store = useFeedStore();
        await Promise.resolve();
        await store.feedTableLookup();

        expect(store.feedTableData).toEqual([
            expect.objectContaining({
                userId: 'resonite:U-friend',
                displayName: 'Contact'
            })
        ]);
    });

    test('does not append live feed entries for the logged-in Resonite self-contact', () => {
        const store = useFeedStore();

        store.addFeedEntry({
            type: 'Online',
            userId: 'resonite:U-self',
            displayName: 'Current Self',
            created_at: '2026-04-22T00:00:00.000Z'
        });
        store.addFeedEntry({
            type: 'Online',
            userId: 'resonite:U-friend',
            displayName: 'Contact',
            created_at: '2026-04-22T00:01:00.000Z'
        });

        expect(store.feedTableData).toEqual([
            expect.objectContaining({
                userId: 'resonite:U-friend',
                displayName: 'Contact'
            })
        ]);
    });
});
