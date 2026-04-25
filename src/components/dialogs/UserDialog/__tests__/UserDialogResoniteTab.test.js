import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { flushPromises, mount } from '@vue/test-utils';

const mockFetchResoniteInventoryRecords = vi.fn();
const mockFetchResoniteInventoryOwnerDetails = vi.fn();
const mockResolveResoniteInventoryLink = vi.fn();

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
vi.mock('../../../../services/resoniteInventory', () => ({
    RESONITE_INVENTORY_ROOT_PATH: 'Inventory',
    normalizeResoniteInventoryPath: vi.fn(
        (path) => String(path || '').trim() || 'Inventory'
    ),
    getParentResoniteInventoryPath: vi.fn((path) => {
        const normalized = String(path || '').trim() || 'Inventory';
        const segments = normalized.split('\\').filter(Boolean);
        return segments.length <= 1
            ? 'Inventory'
            : segments.slice(0, -1).join('\\');
    }),
    sortResoniteInventoryRecords: vi.fn((records, sortMode = 'name-asc') => {
        const nextRecords = [...(Array.isArray(records) ? records : [])];
        const compare = (left, right) => {
            if (Boolean(left?.isNavigable) !== Boolean(right?.isNavigable)) {
                return left?.isNavigable ? -1 : 1;
            }

            const leftName = String(left?.name || '').toLowerCase();
            const rightName = String(right?.name || '').toLowerCase();
            const leftCreatedAt = Date.parse(String(left?.createdAt || ''));
            const rightCreatedAt = Date.parse(String(right?.createdAt || ''));

            if (sortMode === 'created-desc') {
                if (
                    !Number.isNaN(leftCreatedAt) &&
                    !Number.isNaN(rightCreatedAt) &&
                    rightCreatedAt !== leftCreatedAt
                ) {
                    return rightCreatedAt - leftCreatedAt;
                }
            } else if (sortMode === 'created-asc') {
                if (
                    !Number.isNaN(leftCreatedAt) &&
                    !Number.isNaN(rightCreatedAt) &&
                    leftCreatedAt !== rightCreatedAt
                ) {
                    return leftCreatedAt - rightCreatedAt;
                }
            }

            if (leftName !== rightName) {
                return leftName.localeCompare(rightName);
            }

            return String(left?.id || '').localeCompare(
                String(right?.id || '')
            );
        };

        return nextRecords.sort(compare);
    }),
    fetchResoniteInventoryRecords: (...args) =>
        mockFetchResoniteInventoryRecords(...args),
    fetchResoniteInventoryOwnerDetails: (...args) =>
        mockFetchResoniteInventoryOwnerDetails(...args),
    resolveResoniteInventoryLink: (...args) =>
        mockResolveResoniteInventoryLink(...args)
}));

import UserDialogResoniteTab from '../UserDialogResoniteTab.vue';
import { useGalleryStore, useUserStore } from '../../../../stores';

function mountComponent(resonite = {}, overrides = {}) {
    const pinia = createTestingPinia({
        stubActions: false
    });

    const userStore = useUserStore(pinia);
    const galleryStore = useGalleryStore(pinia);
    userStore.$patch({
        currentUser: {
            id: overrides.currentUser?.id || 'usr_me',
            $resonitePresence: overrides.currentUser?.$resonitePresence || null
        },
        userDialog: {
            id: overrides.userDialog?.id || 'resonite:U-external',
            ref: {
                resonite,
                ...(overrides.userDialog?.ref || {})
            },
            ...(overrides.userDialog || {})
        }
    });

    const wrapper = mount(UserDialogResoniteTab, {
        global: {
            plugins: [pinia],
            stubs: {
                TooltipWrapper: {
                    template: '<div><slot /></div>'
                }
            }
        }
    });

    return {
        wrapper,
        galleryStore
    };
}

describe('UserDialogResoniteTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchResoniteInventoryRecords.mockResolvedValue([]);
        mockFetchResoniteInventoryOwnerDetails.mockResolvedValue(null);
        mockResolveResoniteInventoryLink.mockResolvedValue(null);
    });

    test('renders enriched profile metadata when available', () => {
        const { wrapper } = mountComponent({
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
        const { wrapper } = mountComponent({ realtime: {} });

        expect(wrapper.text()).toContain('Profile');
        expect(wrapper.text()).toContain('Username');
        expect(wrapper.text()).toContain('Normalized Username');
        expect(wrapper.text()).toContain('Registered');
    });

    test('loads self Resonite inventory using the linked self user id', async () => {
        mockFetchResoniteInventoryRecords.mockResolvedValue([
            {
                id: 'R-dir',
                name: '<color=orange>Tools</color>',
                recordTypeLabel: 'Folder',
                createdAt: '2026-04-24T00:00:00.000Z',
                isNavigable: true
            },
            {
                id: 'R-1',
                name: '<color=cyan>Builder Cube</color>',
                recordTypeLabel: 'Texture',
                createdAt: '2026-04-24T00:00:00.000Z',
                isNavigable: false,
                thumbnailUrl: 'https://example.com/thumb.png'
            }
        ]);

        const { wrapper } = mountComponent(
            {
                realtime: {},
                profile: {
                    tagline: 'Self profile'
                }
            },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self',
                        linkedDisplayName: 'SelfResonite'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        expect(mockFetchResoniteInventoryRecords).toHaveBeenCalledWith({
            userId: 'U-self',
            ownerId: 'U-self',
            path: 'Inventory'
        });
        expect(wrapper.text()).toContain('Inventory');
        expect(wrapper.text()).toContain('Folders and Links');
        expect(wrapper.text()).toContain('Items');
        expect(wrapper.text()).toContain('Tools');
        expect(wrapper.text()).toContain('Builder Cube');
        expect(wrapper.find('img').attributes('src')).toBe(
            'https://example.com/thumb.png'
        );
    });

    test('shows an Up action and navigates to the parent inventory path', async () => {
        mockFetchResoniteInventoryRecords
            .mockResolvedValueOnce([
                {
                    id: 'R-deep',
                    name: 'Deep Item',
                    recordTypeLabel: 'Texture',
                    createdAt: '2026-04-24T00:00:00.000Z',
                    isNavigable: false
                }
            ])
            .mockResolvedValueOnce([]);

        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();
        await wrapper.vm.goToInventoryPath('Inventory\\Tools\\Subfolder');
        await flushPromises();

        const upButton = wrapper
            .findAll('button')
            .find((button) => button.text() === 'Up');
        expect(upButton).toBeTruthy();

        await upButton.trigger('click');
        await flushPromises();

        expect(mockFetchResoniteInventoryRecords).toHaveBeenLastCalledWith({
            userId: 'U-self',
            ownerId: 'U-self',
            path: 'Inventory\\Tools'
        });
    });

    test('opens fullscreen preview for thumbnail inventory items', async () => {
        mockFetchResoniteInventoryRecords.mockResolvedValue([
            {
                id: 'R-1',
                name: 'Builder Cube',
                recordTypeLabel: 'Texture',
                createdAt: '2026-04-24T00:00:00.000Z',
                isNavigable: false,
                thumbnailUrl: 'https://example.com/thumb.png'
            }
        ]);

        const { wrapper, galleryStore } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        const itemButton = wrapper
            .findAll('button')
            .find((button) => button.text().includes('Builder Cube'));
        expect(itemButton).toBeTruthy();

        await itemButton.trigger('click');

        expect(galleryStore.fullscreenImageDialog.visible).toBe(true);
        expect(galleryStore.fullscreenImageDialog.imageUrl).toBe(
            'https://example.com/thumb.png'
        );
        expect(galleryStore.fullscreenImageDialog.fileName).toBe(
            'Builder Cube'
        );
    });

    test('ignores rapid repeat folder opens while the destination inventory is still loading', async () => {
        let resolveFolderLoad;
        mockFetchResoniteInventoryRecords
            .mockResolvedValueOnce([
                {
                    id: 'R-folder',
                    name: 'Tools',
                    absolutePath: 'Inventory\\Tools',
                    ownerId: 'U-self',
                    recordTypeLabel: 'Folder',
                    createdAt: '2026-04-24T00:00:00.000Z',
                    isNavigable: true
                }
            ])
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFolderLoad = resolve;
                    })
            );

        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        const record = {
            id: 'R-folder',
            name: 'Tools',
            absolutePath: 'Inventory\\Tools',
            ownerId: 'U-self',
            isNavigable: true
        };

        wrapper.vm.openInventoryRecord(record);
        wrapper.vm.openInventoryRecord(record);

        expect(
            wrapper.vm.inventoryBreadcrumbs.map(
                (breadcrumb) => breadcrumb.label
            )
        ).toEqual(['Inventory', 'Tools']);
        expect(mockFetchResoniteInventoryRecords).toHaveBeenCalledTimes(2);

        resolveFolderLoad([]);
        await flushPromises();
    });

    test('sort controls reorder records while keeping folders before items', async () => {
        mockFetchResoniteInventoryRecords.mockResolvedValue([
            {
                id: 'R-folder-a',
                name: 'Alpha Folder',
                recordTypeLabel: 'Folder',
                createdAt: '2026-04-22T00:00:00.000Z',
                isNavigable: true
            },
            {
                id: 'R-folder-z',
                name: 'Zeta Folder',
                recordTypeLabel: 'Folder',
                createdAt: '2026-04-24T00:00:00.000Z',
                isNavigable: true
            },
            {
                id: 'R-item-a',
                name: 'Alpha Item',
                recordTypeLabel: 'Texture',
                createdAt: '2026-04-21T00:00:00.000Z',
                isNavigable: false
            },
            {
                id: 'R-item-z',
                name: 'Zeta Item',
                recordTypeLabel: 'Texture',
                createdAt: '2026-04-23T00:00:00.000Z',
                isNavigable: false
            }
        ]);

        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        const newestButton = wrapper
            .findAll('button')
            .find((button) => button.text() === 'Newest');
        expect(newestButton).toBeTruthy();

        await newestButton.trigger('click');
        await flushPromises();

        expect(
            wrapper.vm.inventoryPathRecords.map((record) => record.name)
        ).toEqual(['Zeta Folder', 'Alpha Folder']);
        expect(
            wrapper.vm.inventoryObjectRecords.map((record) => record.name)
        ).toEqual(['Zeta Item', 'Alpha Item']);
    });

    test('opens group inventory links by switching to the group owner scope', async () => {
        mockFetchResoniteInventoryRecords.mockResolvedValue([]);
        mockFetchResoniteInventoryOwnerDetails.mockResolvedValue({
            ownerId: 'G-group',
            ownerType: 'group',
            displayName: 'Metaverse Academia'
        });
        mockResolveResoniteInventoryLink.mockResolvedValue({
            ownerId: 'G-group',
            absolutePath: 'Inventory\\Shared Group Folder'
        });

        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        await wrapper.vm.openInventoryRecord({
            id: 'R-link',
            name: 'Shared Group Folder',
            isNavigable: true,
            isLink: true,
            linkOwnerId: 'G-group',
            linkRecordId: 'R-link'
        });
        await flushPromises();

        expect(mockResolveResoniteInventoryLink).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'R-link' })
        );
        expect(mockFetchResoniteInventoryRecords).toHaveBeenLastCalledWith({
            userId: 'U-self',
            ownerId: 'G-group',
            path: 'Inventory\\Shared Group Folder'
        });
        expect(mockFetchResoniteInventoryOwnerDetails).toHaveBeenLastCalledWith(
            'G-group'
        );
        expect(wrapper.vm.inventoryOwnerDisplayText).toBe('Metaverse Academia');
    });

    test('keeps the traversed breadcrumb trail for linked folders and exposes the resolved target path separately', async () => {
        mockFetchResoniteInventoryRecords.mockResolvedValue([]);
        mockFetchResoniteInventoryOwnerDetails.mockResolvedValue({
            ownerId: 'G-group',
            ownerType: 'group',
            displayName: 'Metaverse Academia'
        });
        mockResolveResoniteInventoryLink.mockResolvedValue({
            ownerId: 'G-group',
            absolutePath: 'Inventory\\Private Root\\Nested Shared Folder'
        });

        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        await wrapper.vm.openInventoryRecord({
            id: 'R-link',
            name: 'Shared Group Folder',
            isNavigable: true,
            isLink: true,
            linkOwnerId: 'G-group',
            linkRecordId: 'R-link'
        });
        await flushPromises();

        expect(
            wrapper.vm.inventoryBreadcrumbs.map((record) => record.label)
        ).toEqual(['Inventory', 'Shared Group Folder']);
        expect(wrapper.vm.showInventoryTargetInfo).toBe(true);
        expect(wrapper.text()).toContain('Shared Group Folder');
        expect(wrapper.text()).not.toContain('Visible trail:');
        expect(wrapper.text()).not.toContain('Private Root');
        expect(wrapper.text()).not.toContain('Nested Shared Folder');
        expect(wrapper.vm.inventoryOwnerDisplayText).toBe('Metaverse Academia');
    });

    test('returns breadcrumb root navigation to the self inventory owner after opening a linked folder', async () => {
        mockFetchResoniteInventoryRecords.mockResolvedValue([]);
        mockResolveResoniteInventoryLink.mockResolvedValue({
            ownerId: 'G-group',
            absolutePath: 'Inventory\\Private Root\\Nested Shared Folder'
        });

        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'resonite:U-self'
                }
            }
        );

        await flushPromises();

        await wrapper.vm.openInventoryRecord({
            id: 'R-link',
            name: 'Shared Group Folder',
            isNavigable: true,
            isLink: true,
            linkOwnerId: 'G-group',
            linkRecordId: 'R-link'
        });
        await flushPromises();

        await wrapper.vm.goToInventoryBreadcrumb(0);
        await flushPromises();

        expect(mockFetchResoniteInventoryRecords).toHaveBeenLastCalledWith({
            userId: 'U-self',
            ownerId: 'U-self',
            path: 'Inventory'
        });
        expect(
            wrapper.vm.inventoryBreadcrumbs.map((record) => record.label)
        ).toEqual(['Inventory']);
    });

    test('does not treat the VRChat self dialog as Resonite self', async () => {
        const { wrapper } = mountComponent(
            { realtime: {} },
            {
                currentUser: {
                    id: 'usr_me',
                    $resonitePresence: {
                        linkedContactId: 'resonite:U-self',
                        linkedUserId: 'U-self'
                    }
                },
                userDialog: {
                    id: 'usr_me'
                }
            }
        );

        await flushPromises();

        expect(mockFetchResoniteInventoryRecords).not.toHaveBeenCalled();
        expect(wrapper.text()).not.toContain('Inventory');
    });
});
