import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockWebApiExecute = vi.fn();
const mockEnsureResoniteSessionIsFresh = vi.fn();
const mockAdvancedSettingsStore = {
    resoniteApiKey: ''
};

vi.mock('../../services/webapi', () => ({
    default: {
        execute: (...args) => mockWebApiExecute(...args)
    }
}));

vi.mock('../../stores', () => ({
    useAdvancedSettingsStore: () => mockAdvancedSettingsStore
}));

vi.mock('../../services/resoniteAuth', () => ({
    buildResoniteAuthorizationHeader: vi.fn((apiKey) => `Bearer ${apiKey}`),
    ensureResoniteSessionIsFresh: (...args) =>
        mockEnsureResoniteSessionIsFresh(...args)
}));

vi.mock('../../shared/utils/common', () => ({
    convertFileUrlToImageUrl: vi.fn((value) => value)
}));

import {
    fetchResoniteInventoryOwnerDetails,
    fetchResoniteInventoryRecords,
    getResoniteInventoryOwnerPath,
    resolveResoniteInventoryLink,
    sortResoniteInventoryRecords
} from '../resoniteInventory';

describe('resoniteInventory service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAdvancedSettingsStore.resoniteApiKey = 'session-key';
        mockEnsureResoniteSessionIsFresh.mockResolvedValue(undefined);
    });

    test('fetchResoniteInventoryRecords uses group record endpoints for group owners', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify([])
        });

        await fetchResoniteInventoryRecords({
            userId: 'U-self',
            ownerId: 'G-group',
            path: 'Inventory'
        });

        expect(mockWebApiExecute).toHaveBeenCalledWith({
            url: 'https://api.resonite.com/groups/G-group/records?path=Inventory',
            method: 'GET',
            headers: {
                Authorization: 'Bearer session-key'
            }
        });
    });

    test('resolveResoniteInventoryLink uses group record endpoints for group links', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                id: 'R-link',
                ownerId: 'G-group',
                name: 'Shared Folder',
                path: 'Inventory',
                recordType: 'directory'
            })
        });

        const result = await resolveResoniteInventoryLink({
            linkOwnerId: 'G-group',
            linkRecordId: 'R-link'
        });

        expect(mockWebApiExecute).toHaveBeenCalledWith({
            url: 'https://api.resonite.com/groups/G-group/records/R-link',
            method: 'GET',
            headers: {
                Authorization: 'Bearer session-key'
            }
        });
        expect(result).toMatchObject({
            ownerId: 'G-group',
            absolutePath: 'Inventory\\Shared Folder'
        });
    });

    test('fetchResoniteInventoryOwnerDetails uses user endpoints for user owners', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                id: 'U-self',
                username: 'SelfResonite'
            })
        });

        const result = await fetchResoniteInventoryOwnerDetails('U-self');

        expect(mockWebApiExecute).toHaveBeenCalledWith({
            url: 'https://api.resonite.com/users/U-self',
            method: 'GET',
            headers: {
                Authorization: 'Bearer session-key'
            }
        });
        expect(result).toMatchObject({
            ownerId: 'U-self',
            ownerType: 'user',
            username: 'SelfResonite',
            displayName: 'SelfResonite'
        });
    });

    test('fetchResoniteInventoryOwnerDetails uses group endpoints for group owners', async () => {
        mockWebApiExecute.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                id: 'G-group',
                name: 'Metaverse Academia'
            })
        });

        const result = await fetchResoniteInventoryOwnerDetails('G-group');

        expect(mockWebApiExecute).toHaveBeenCalledWith({
            url: 'https://api.resonite.com/groups/G-group',
            method: 'GET',
            headers: {
                Authorization: 'Bearer session-key'
            }
        });
        expect(result).toMatchObject({
            ownerId: 'G-group',
            ownerType: 'group',
            displayName: 'Metaverse Academia'
        });
    });

    test('sortResoniteInventoryRecords keeps navigable records first for newest sort mode', () => {
        const result = sortResoniteInventoryRecords(
            [
                {
                    id: 'item-a',
                    name: 'Alpha Item',
                    isNavigable: false,
                    createdAt: '2026-04-21T00:00:00.000Z'
                },
                {
                    id: 'folder-a',
                    name: 'Alpha Folder',
                    isNavigable: true,
                    createdAt: '2026-04-22T00:00:00.000Z'
                },
                {
                    id: 'item-z',
                    name: 'Zeta Item',
                    isNavigable: false,
                    createdAt: '2026-04-23T00:00:00.000Z'
                },
                {
                    id: 'folder-z',
                    name: 'Zeta Folder',
                    isNavigable: true,
                    createdAt: '2026-04-24T00:00:00.000Z'
                }
            ],
            'created-desc'
        );

        expect(result.map((record) => record.id)).toEqual([
            'folder-z',
            'folder-a',
            'item-z',
            'item-a'
        ]);
    });

    test('getResoniteInventoryOwnerPath switches between user and group scopes', () => {
        expect(getResoniteInventoryOwnerPath('U-self')).toBe('/users/U-self');
        expect(getResoniteInventoryOwnerPath('G-group')).toBe(
            '/groups/G-group'
        );
    });
});
