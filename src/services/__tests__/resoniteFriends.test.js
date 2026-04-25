import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockWebApiServiceExecute = vi.fn();
const mockConfigRepositoryGetString = vi.fn();
const mockConfigRepositorySetString = vi.fn();
const { mockDatabase } = vi.hoisted(() => ({
    mockDatabase: {
        getResoniteCachedProfiles: vi.fn(),
        upsertResoniteCachedProfile: vi.fn()
    }
}));
const mockAdvancedSettingsStore = {
    resoniteFriendsEndpoint: '',
    resoniteApiKey: ''
};

function setAdvancedSettingsStore(values) {
    Object.assign(mockAdvancedSettingsStore, values);
}

vi.mock('../../services/webapi', () => ({
    default: {
        execute: (...args) => mockWebApiServiceExecute(...args)
    }
}));

vi.mock('../../stores', () => ({
    useAdvancedSettingsStore: () => mockAdvancedSettingsStore
}));

vi.mock('../../services/database', () => ({
    database: mockDatabase
}));

vi.mock('../../services/config', () => ({
    default: {
        getString: (...args) => mockConfigRepositoryGetString(...args),
        setString: (...args) => mockConfigRepositorySetString(...args)
    }
}));

import {
    buildResoniteAuthorizationHeader,
    createResoniteSession,
    fetchResoniteFriends,
    fetchResoniteUserProfiles,
    mergeResoniteUserProfile,
    normalizeResoniteFriends,
    normalizeResoniteFriend,
    isValidResoniteFriendContext
} from '../resoniteFriends';

describe('resoniteFriends service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setAdvancedSettingsStore({
            resoniteFriendsEndpoint: '',
            resoniteApiKey: ''
        });
        mockConfigRepositoryGetString.mockResolvedValue('stable-uid-hash');
        mockConfigRepositorySetString.mockResolvedValue(undefined);
        mockDatabase.getResoniteCachedProfiles.mockResolvedValue([]);
        mockDatabase.upsertResoniteCachedProfile.mockResolvedValue(undefined);

        vi.stubGlobal('crypto', {
            randomUUID: vi.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
            subtle: {
                digest: vi
                    .fn()
                    .mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
            }
        });
    });

    describe('fetchResoniteFriends', () => {
        test('returns empty array when endpoint is not configured', async () => {
            setAdvancedSettingsStore({ resoniteFriendsEndpoint: '' });

            const result = await fetchResoniteFriends();

            expect(result).toEqual({ success: false, friends: [] });
            expect(mockWebApiServiceExecute).not.toHaveBeenCalled();
        });

        test('fetches and normalizes friends from endpoint', async () => {
            setAdvancedSettingsStore({
                resoniteFriendsEndpoint: 'https://api.example.com/friends'
            });
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify([
                    {
                        id: 'u-resonite-123',
                        displayName: 'TestUser',
                        status: 'online',
                        statusDescription: 'Playing games'
                    }
                ])
            });

            const result = await fetchResoniteFriends();

            expect(mockWebApiServiceExecute).toHaveBeenCalledWith({
                url: 'https://api.example.com/friends',
                method: 'GET',
                headers: {}
            });
            expect(result.success).toBe(true);
            expect(result.friends).toHaveLength(1);
            expect(result.friends[0].provider).toBe('resonite');
        });

        test('includes authorization header when API key is configured', async () => {
            setAdvancedSettingsStore({
                resoniteFriendsEndpoint: 'https://api.example.com/friends',
                resoniteApiKey: 'secret-key-123'
            });
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify([])
            });

            await fetchResoniteFriends();

            expect(mockWebApiServiceExecute).toHaveBeenCalledWith({
                url: 'https://api.example.com/friends',
                method: 'GET',
                headers: {
                    Authorization: 'Bearer secret-key-123'
                }
            });
        });

        test('uses native resonite authorization format when api key contains user and token', async () => {
            setAdvancedSettingsStore({
                resoniteFriendsEndpoint:
                    'https://api.resonite.com/users/U-test/contacts',
                resoniteApiKey: 'U-test:session-token'
            });
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify([])
            });

            await fetchResoniteFriends();

            expect(mockWebApiServiceExecute).toHaveBeenCalledWith({
                url: 'https://api.resonite.com/users/U-test/contacts',
                method: 'GET',
                headers: {
                    Authorization: 'res U-test:session-token'
                }
            });
        });

        test('returns empty array on non-200 status', async () => {
            setAdvancedSettingsStore({
                resoniteFriendsEndpoint: 'https://api.example.com/friends'
            });
            mockWebApiServiceExecute.mockResolvedValue({
                status: 401,
                data: 'Unauthorized'
            });

            const result = await fetchResoniteFriends();

            expect(result).toEqual({ success: false, friends: [] });
        });

        test('returns empty array on JSON parse error', async () => {
            setAdvancedSettingsStore({
                resoniteFriendsEndpoint: 'https://api.example.com/friends'
            });
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: 'invalid json {{'
            });

            const result = await fetchResoniteFriends();

            expect(result).toEqual({ success: false, friends: [] });
        });

        test('returns empty array on fetch error', async () => {
            setAdvancedSettingsStore({
                resoniteFriendsEndpoint: 'https://api.example.com/friends'
            });
            mockWebApiServiceExecute.mockRejectedValue(
                new Error('Network error')
            );

            const result = await fetchResoniteFriends();

            expect(result).toEqual({ success: false, friends: [] });
        });
    });

    describe('buildResoniteAuthorizationHeader', () => {
        test('returns native resonite header for U- prefixed userId/token keys', () => {
            expect(buildResoniteAuthorizationHeader('U-abc:token-value')).toBe(
                'res U-abc:token-value'
            );
        });

        test('keeps preformatted native header as-is', () => {
            expect(
                buildResoniteAuthorizationHeader('res U-abc:token-value')
            ).toBe('res U-abc:token-value');
        });

        test('falls back to bearer for generic keys', () => {
            expect(buildResoniteAuthorizationHeader('proxy-key')).toBe(
                'Bearer proxy-key'
            );
        });
    });

    describe('createResoniteSession', () => {
        test('creates session and returns normalized api key', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    userId: 'U-abc',
                    token: 'session-token'
                })
            });

            const result = await createResoniteSession({
                username: 'test-user',
                password: 'secret-password',
                rememberMe: true
            });

            expect(result).toEqual(
                expect.objectContaining({
                    userId: 'U-abc',
                    token: 'session-token',
                    apiKey: 'U-abc:session-token',
                    rememberMe: true
                })
            );
            expect(result.tokenExpiresAt).toBeTypeOf('number');

            expect(mockWebApiServiceExecute).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'https://api.resonite.com/userSessions',
                    method: 'POST',
                    headers: expect.objectContaining({
                        UID: 'stable-uid-hash',
                        'Content-Type': 'application/json'
                    })
                })
            );
        });

        test('accepts response shape with root id and token', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    id: 'U-root-id',
                    token: 'session-token'
                })
            });

            const result = await createResoniteSession({
                username: 'test-user',
                password: 'secret-password'
            });

            expect(result.apiKey).toBe('U-root-id:session-token');
        });

        test('accepts response shape with nested user.id and sessionToken', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    user: { id: 'U-nested' },
                    sessionToken: 'nested-token'
                })
            });

            const result = await createResoniteSession({
                username: 'test-user',
                password: 'secret-password'
            });

            expect(result.apiKey).toBe('U-nested:nested-token');
        });

        test('accepts response shape with entity.id and entity.token', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    entity: {
                        id: 'U-entity',
                        token: 'entity-token'
                    }
                })
            });

            const result = await createResoniteSession({
                username: 'test-user',
                password: 'secret-password'
            });

            expect(result.apiKey).toBe('U-entity:entity-token');
        });

        test('includes TOTP header when provided', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    userId: 'U-abc',
                    token: 'session-token'
                })
            });

            await createResoniteSession({
                username: 'test-user',
                password: 'secret-password',
                totp: '123456'
            });

            expect(mockWebApiServiceExecute).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        TOTP: '123456'
                    })
                })
            );
        });

        test('does not include TOTP header when not provided', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    userId: 'U-abc',
                    token: 'session-token'
                })
            });

            await createResoniteSession({
                username: 'test-user',
                password: 'secret-password'
            });

            const call = mockWebApiServiceExecute.mock.calls[0][0];
            expect(call.headers).not.toHaveProperty('TOTP');
        });

        test('does not include TOTP header when empty string', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    userId: 'U-abc',
                    token: 'session-token'
                })
            });

            await createResoniteSession({
                username: 'test-user',
                password: 'secret-password',
                totp: ''
            });

            const call = mockWebApiServiceExecute.mock.calls[0][0];
            expect(call.headers).not.toHaveProperty('TOTP');
        });

        test('sends email key when username contains @', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    userId: 'U-abc',
                    token: 'session-token'
                })
            });

            await createResoniteSession({
                username: 'user@example.com',
                password: 'secret-password'
            });

            const call = mockWebApiServiceExecute.mock.calls[0][0];
            const body = JSON.parse(call.body);
            expect(body.email).toBe('user@example.com');
            expect(body.username).toBeUndefined();
        });

        test('sends username key when username has no @', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    userId: 'U-abc',
                    token: 'session-token'
                })
            });

            await createResoniteSession({
                username: 'plain-username',
                password: 'secret-password'
            });

            const call = mockWebApiServiceExecute.mock.calls[0][0];
            const body = JSON.parse(call.body);
            expect(body.username).toBe('plain-username');
            expect(body.email).toBeUndefined();
        });
    });

    describe('normalizeResoniteFriends', () => {
        test('normalizes array root payload', () => {
            const payload = [
                {
                    id: 'u-123',
                    displayName: 'User1',
                    status: 'online',
                    statusDescription: 'Playing'
                },
                {
                    id: 'u-456',
                    displayName: 'User2',
                    status: 'offline'
                }
            ];

            const result = normalizeResoniteFriends(payload);

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('resonite:u-123');
            expect(result[0].name).toBe('User1');
            expect(result[0].state).toBe('online');
            expect(result[1].state).toBe('offline');
        });

        test('normalizes object root with friends property', () => {
            const payload = {
                friends: [
                    {
                        id: 'u-123',
                        displayName: 'User1',
                        status: 'online'
                    }
                ]
            };

            const result = normalizeResoniteFriends(payload);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('resonite:u-123');
        });

        test('normalizes object root with contacts property', () => {
            const payload = {
                contacts: [
                    { id: 'u-123', displayName: 'User1', status: 'online' }
                ]
            };

            const result = normalizeResoniteFriends(payload);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('resonite:u-123');
            expect(result[0].name).toBe('User1');
        });

        test('normalizes entity wrapped contacts payload', () => {
            const payload = {
                entity: {
                    contacts: [
                        {
                            entity: {
                                id: 'U-entity-1',
                                name: 'WrappedUser',
                                status: 'Online',
                                statusMessage: 'Testing',
                                userIcon: 'https://example.com/icon.png'
                            }
                        }
                    ]
                }
            };

            const result = normalizeResoniteFriends(payload);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('resonite:U-entity-1');
            expect(result[0].name).toBe('WrappedUser');
            expect(result[0].state).toBe('online');
            expect(result[0].ref.profileImageUrl).toBe(
                'https://example.com/icon.png'
            );
        });

        test('returns empty array for null payload', () => {
            const result = normalizeResoniteFriends(null);
            expect(result).toEqual([]);
        });

        test('returns empty array for undefined payload', () => {
            const result = normalizeResoniteFriends(undefined);
            expect(result).toEqual([]);
        });

        test('normalizes entity wrapped friend entry', () => {
            const entry = {
                entity: {
                    id: 'U-entity-123',
                    name: 'EntityUser',
                    onlineStatus: 'Busy',
                    statusMessage: 'In session',
                    userIcon: 'https://example.com/entity.png'
                }
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.id).toBe('resonite:U-entity-123');
            expect(result.name).toBe('EntityUser');
            expect(result.state).toBe('online');
            expect(result.ref.statusDescription).toBe('In session');
            expect(result.ref.userIcon).toBe('https://example.com/entity.png');
        });

        test('normalizes object-wrapped display name', () => {
            const entry = {
                id: 'U-object-name',
                entity: {
                    displayName: { value: 'Wrapped Display Name' },
                    onlineStatus: 'Online'
                }
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.id).toBe('resonite:U-object-name');
            expect(result.name).toBe('Wrapped Display Name');
            expect(result.state).toBe('online');
        });

        test('returns empty array for payload without friends array', () => {
            const result = normalizeResoniteFriends({ data: [] });
            expect(result).toEqual([]);
        });

        test('skips invalid entries but continues processing valid ones', () => {
            const payload = [
                { id: '', displayName: 'Invalid' }, // Missing valid id
                { id: 'u-123', displayName: 'User1', status: 'online' }, // Valid
                { displayName: 'Invalid' }, // Missing id
                { id: 'u-456', displayName: 'User2', status: 'online' } // Valid
            ];

            const result = normalizeResoniteFriends(payload);

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('resonite:u-123');
            expect(result[1].id).toBe('resonite:u-456');
        });

        test('maps status to online/offline correctly', () => {
            const statuses = [
                { status: 'online', expectedState: 'online' },
                { status: 'offline', expectedState: 'offline' },
                { status: 'busy', expectedState: 'online' },
                { status: 'away', expectedState: 'online' },
                { status: 'invisible', expectedState: 'offline' },
                { status: 'unknown', expectedState: 'offline' },
                { status: undefined, expectedState: 'offline' }
            ];

            for (const { status, expectedState } of statuses) {
                const entry = {
                    id: 'u-123',
                    displayName: 'User',
                    ...(status !== undefined && { status })
                };
                const normalized = normalizeResoniteFriend(entry);
                expect(normalized.state).toBe(expectedState);
            }
        });
    });

    describe('fetchResoniteUserProfiles', () => {
        test('hydrates profile results from structured cache before network fetch', async () => {
            mockDatabase.getResoniteCachedProfiles.mockResolvedValue([
                {
                    resoniteUserId: 'U-cache',
                    displayName: 'Cached User',
                    username: 'cached_user',
                    registrationDate: '2026-04-01T00:00:00.000Z',
                    isVerified: 1,
                    tags: ['builder'],
                    iconUrl: 'https://example.com/cached.png',
                    tagline: 'Cached tagline',
                    description: 'Cached description',
                    fetchedAt: Date.now(),
                    expiresAt: Date.now() + 60_000,
                    payload: {
                        id: 'U-cache',
                        username: 'cached_user',
                        registrationDate: '2026-04-01T00:00:00.000Z',
                        isVerified: true,
                        tags: ['builder'],
                        profile: {
                            iconUrl: 'https://example.com/cached.png',
                            tagline: 'Cached tagline',
                            description: 'Cached description'
                        }
                    }
                }
            ]);

            const result = await fetchResoniteUserProfiles(['U-cache'], {
                apiBaseUrl: 'https://api.resonite.com'
            });

            expect(result.get('U-cache')).toMatchObject({
                id: 'U-cache',
                username: 'cached_user'
            });
            expect(mockWebApiServiceExecute).not.toHaveBeenCalled();
        });

        test('persists fetched user profiles into structured cache', async () => {
            mockWebApiServiceExecute.mockResolvedValue({
                status: 200,
                data: JSON.stringify({
                    id: 'U-network',
                    username: 'network_user',
                    registrationDate: '2026-04-10T00:00:00.000Z',
                    isVerified: true,
                    tags: ['tester'],
                    profile: {
                        iconUrl:
                            'resdb:///6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754.webp',
                        tagline: 'Fetched tagline',
                        description: 'Fetched description'
                    }
                })
            });

            const result = await fetchResoniteUserProfiles(['U-network'], {
                apiBaseUrl: 'https://api.resonite.com',
                headers: {
                    Authorization: 'res U-test:token'
                }
            });

            expect(result.get('U-network')).toMatchObject({
                id: 'U-network',
                username: 'network_user'
            });
            expect(
                mockDatabase.upsertResoniteCachedProfile
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    resoniteUserId: 'U-network',
                    username: 'network_user',
                    registrationDate: '2026-04-10T00:00:00.000Z',
                    tagline: 'Fetched tagline',
                    description: 'Fetched description',
                    iconUrl:
                        'https://assets.resonite.com/6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754'
                })
            );
        });
    });

    describe('mergeResoniteUserProfile', () => {
        test('prefers fetched profile-owned fields over stale snapshot values', () => {
            const friend = {
                id: 'resonite:U-profile',
                name: 'Snapshot User',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    displayName: 'Snapshot User',
                    statusDescription: '',
                    profileImageUrl: 'https://example.com/old.png',
                    userIcon: 'https://example.com/old.png'
                },
                resonite: {
                    username: 'old_username',
                    normalizedUsername: 'old_username',
                    registrationDate: '2025-01-01T00:00:00.000Z',
                    isVerified: false,
                    tags: ['old-tag'],
                    profile: {
                        iconUrl: 'https://example.com/old.png',
                        tagline: 'Old tagline',
                        description: 'Old description'
                    }
                }
            };

            const merged = mergeResoniteUserProfile(friend, {
                username: 'new_username',
                normalizedUsername: 'new_username',
                registrationDate: '2026-04-24T00:00:00.000Z',
                isVerified: true,
                tags: ['new-tag'],
                profile: {
                    iconUrl:
                        'resdb:///6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754.webp',
                    tagline: 'New tagline',
                    description: 'New description'
                }
            });

            expect(merged.resonite.username).toBe('new_username');
            expect(merged.resonite.normalizedUsername).toBe('new_username');
            expect(merged.resonite.registrationDate).toBe(
                '2026-04-24T00:00:00.000Z'
            );
            expect(merged.resonite.isVerified).toBe(true);
            expect(merged.resonite.tags).toEqual(['new-tag']);
            expect(merged.resonite.profile.tagline).toBe('New tagline');
            expect(merged.resonite.profile.description).toBe('New description');
            expect(merged.resonite.profile.iconUrl).toBe(
                'https://assets.resonite.com/6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754'
            );
            expect(merged.resonite.mergeTrace.profile.username).toEqual(
                expect.objectContaining({
                    winner: 'incoming',
                    reason: 'fetched-profile-authoritative',
                    selectedValue: 'new_username'
                })
            );
            expect(
                merged.resonite.mergeTrace.profile['profile.tagline']
            ).toEqual(
                expect.objectContaining({
                    winner: 'incoming',
                    reason: 'fetched-profile-authoritative',
                    selectedValue: 'New tagline'
                })
            );
        });

        test('keeps existing profile-owned fields when fetched payload omits them', () => {
            const friend = {
                id: 'resonite:U-profile-fallback',
                name: 'Snapshot User',
                provider: 'resonite',
                isExternal: true,
                ref: {
                    displayName: 'Snapshot User',
                    statusDescription: ''
                },
                resonite: {
                    username: 'existing_username',
                    normalizedUsername: 'existing_username',
                    registrationDate: '2026-04-01T00:00:00.000Z',
                    isVerified: true,
                    tags: ['existing-tag'],
                    profile: {
                        iconUrl: 'https://example.com/existing.png',
                        tagline: 'Existing tagline',
                        description: 'Existing description'
                    }
                }
            };

            const merged = mergeResoniteUserProfile(friend, {
                profile: {}
            });

            expect(merged.resonite.username).toBe('existing_username');
            expect(merged.resonite.normalizedUsername).toBe(
                'existing_username'
            );
            expect(merged.resonite.registrationDate).toBe(
                '2026-04-01T00:00:00.000Z'
            );
            expect(merged.resonite.isVerified).toBe(true);
            expect(merged.resonite.tags).toEqual(['existing-tag']);
            expect(merged.resonite.profile.tagline).toBe('Existing tagline');
            expect(merged.resonite.profile.description).toBe(
                'Existing description'
            );
            expect(merged.resonite.mergeTrace.profile.username).toEqual(
                expect.objectContaining({
                    winner: 'existing',
                    reason: 'fetched-profile-missing',
                    selectedValue: 'existing_username'
                })
            );
            expect(
                merged.resonite.mergeTrace.profile['profile.description']
            ).toEqual(
                expect.objectContaining({
                    winner: 'existing',
                    reason: 'fetched-profile-missing',
                    selectedValue: 'Existing description'
                })
            );
        });
    });

    describe('normalizeResoniteFriend', () => {
        test('normalizes valid friend entry', () => {
            const entry = {
                id: 'u-resonite-123',
                displayName: 'TestUser',
                status: 'online',
                statusDescription: 'Playing games',
                profileImageUrl: 'https://example.com/avatar.jpg'
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.id).toBe('resonite:u-resonite-123');
            expect(result.name).toBe('TestUser');
            expect(result.state).toBe('online');
            expect(result.provider).toBe('resonite');
            expect(result.isExternal).toBe(true);
            expect(result.isVIP).toBe(false);
            expect(result.ref.displayName).toBe('TestUser');
            expect(result.ref.profileImageUrl).toBe(
                'https://example.com/avatar.jpg'
            );
        });

        test('returns null for missing id', () => {
            const entry = {
                displayName: 'TestUser',
                status: 'online'
            };

            const result = normalizeResoniteFriend(entry);

            expect(result).toBeNull();
        });

        test('returns null for empty string id', () => {
            const entry = {
                id: '   ',
                displayName: 'TestUser'
            };

            const result = normalizeResoniteFriend(entry);

            expect(result).toBeNull();
        });

        test('returns null for missing displayName', () => {
            const entry = {
                id: 'u-123',
                status: 'online'
            };

            const result = normalizeResoniteFriend(entry);

            expect(result).toBeNull();
        });

        test('returns null for empty string displayName', () => {
            const entry = {
                id: 'u-123',
                displayName: '   '
            };

            const result = normalizeResoniteFriend(entry);

            expect(result).toBeNull();
        });

        test('returns null for non-object entry', () => {
            expect(normalizeResoniteFriend(null)).toBeNull();
            expect(normalizeResoniteFriend(undefined)).toBeNull();
            expect(normalizeResoniteFriend('string')).toBeNull();
            expect(normalizeResoniteFriend(123)).toBeNull();
        });

        test('uses default values for optional fields', () => {
            const entry = {
                id: 'u-123',
                displayName: 'TestUser'
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.state).toBe('offline');
            expect(result.ref.statusDescription).toBe('');
            expect(result.ref.profileImageUrl).toBe('');
            expect(result.ref.userIcon).toBe('');
            expect(result.ref.status).toBe('');
            expect(result.ref.location).toBe('offline');
            expect(result.ref.traveling).toBe('');
            expect(result.resonite.hasPresenceSignals).toBe(false);
        });

        test('extracts ReCon contact metadata from nested userStatus/profile fields', () => {
            const entry = {
                id: 'U-recon-123',
                contactUsername: 'ReConUser',
                contactStatus: 'accepted',
                latestMessageTime: '2026-04-19T00:00:00.000Z',
                isAccepted: true,
                userStatus: {
                    onlineStatus: 'Sociable',
                    userSessionId: 'S-123',
                    sessionType: 'Headless',
                    outputDevice: 'Desktop',
                    appVersion: '2026.4.19',
                    compatibilityHash: 'compat-hash',
                    isMobile: false,
                    isPresent: true
                },
                profile: {
                    iconUrl: 'https://example.com/recon.png',
                    tagline: 'Building',
                    description: 'Testing profile'
                }
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.name).toBe('ReConUser');
            expect(result.state).toBe('online');
            expect(result.ref.status).toBe('join me');
            expect(result.ref.statusDescription).toBe('Building');
            expect(result.ref.userIcon).toBe('https://example.com/recon.png');
            expect(result.ref.contactStatus).toBe('accepted');
            expect(result.ref.isAccepted).toBe(true);
            expect(result.resonite.latestMessageTime).toBe(
                '2026-04-19T00:00:00.000Z'
            );
            expect(result.resonite.sessionType).toBe('Headless');
            expect(result.resonite.userSessionId).toBe('S-123');
            expect(result.resonite.profile.description).toBe('Testing profile');
        });

        test('converts Resonite resdb profile icons into assets URLs', () => {
            const entry = {
                id: 'U-icon-123',
                contactUsername: 'IconUser',
                profile: {
                    iconUrl:
                        'resdb:///6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754.webp'
                }
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.ref.profileImageUrl).toBe(
                'https://assets.resonite.com/6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754'
            );
            expect(result.ref.userIcon).toBe(
                'https://assets.resonite.com/6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754'
            );
            expect(result.resonite.profile.iconUrl).toBe(
                'https://assets.resonite.com/6683441e7234417d08e9d7228f59afc55bac656ad8b1833f34a8105644a49754'
            );
        });

        test('falls back to id when no display name fields are present', () => {
            const entry = {
                id: 'U-no-name',
                userStatus: { onlineStatus: 4 }
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.name).toBe('U-no-name');
            expect(result.state).toBe('online');
            expect(result.ref.displayName).toBe('U-no-name');
            expect(result.ref.status).toBe('active');
        });

        test('defaults status to offline when not provided', () => {
            const entry = {
                id: 'u-123',
                displayName: 'TestUser'
            };

            const result = normalizeResoniteFriend(entry);

            expect(result.state).toBe('offline');
            expect(result.ref.status).toBe('');
            expect(result.ref.location).toBe('offline');
        });

        test('case-insensitive status mapping', () => {
            const testCases = [
                { status: 'ONLINE', expectedState: 'online' },
                { status: 'Online', expectedState: 'online' },
                { status: 'OFFLINE', expectedState: 'offline' },
                { status: 'BuSy', expectedState: 'online' }
            ];

            for (const { status, expectedState } of testCases) {
                const entry = { id: 'u-123', displayName: 'User', status };
                const result = normalizeResoniteFriend(entry);
                expect(result.state).toBe(expectedState);
            }
        });
    });

    describe('isValidResoniteFriendContext', () => {
        test('validates correct friend context', () => {
            const context = {
                id: 'resonite:u-123',
                name: 'TestUser',
                state: 'online',
                isVIP: false,
                provider: 'resonite',
                isExternal: true,
                ref: {
                    id: 'resonite:u-123',
                    displayName: 'TestUser'
                }
            };

            expect(isValidResoniteFriendContext(context)).toBe(true);
        });

        test('rejects null or undefined context', () => {
            expect(isValidResoniteFriendContext(null)).toBe(false);
            expect(isValidResoniteFriendContext(undefined)).toBe(false);
        });

        test('rejects context without resonite: prefix in id', () => {
            const context = {
                id: 'u-123', // Missing resonite: prefix
                name: 'TestUser',
                state: 'online',
                provider: 'resonite',
                ref: { id: 'u-123', displayName: 'TestUser' }
            };

            expect(isValidResoniteFriendContext(context)).toBe(false);
        });

        test('rejects context with invalid state', () => {
            const context = {
                id: 'resonite:u-123',
                name: 'TestUser',
                state: 'unknown', // Invalid state
                provider: 'resonite',
                ref: { id: 'resonite:u-123', displayName: 'TestUser' }
            };

            expect(isValidResoniteFriendContext(context)).toBe(false);
        });

        test('rejects context with wrong provider', () => {
            const context = {
                id: 'resonite:u-123',
                name: 'TestUser',
                state: 'online',
                provider: 'vrchat', // Wrong provider
                ref: { id: 'resonite:u-123', displayName: 'TestUser' }
            };

            expect(isValidResoniteFriendContext(context)).toBe(false);
        });

        test('rejects context missing required fields', () => {
            const baseContext = {
                id: 'resonite:u-123',
                name: 'TestUser',
                state: 'online',
                provider: 'resonite',
                isExternal: true,
                ref: { id: 'resonite:u-123', displayName: 'TestUser' }
            };

            // Missing name
            expect(
                isValidResoniteFriendContext({
                    ...baseContext,
                    name: undefined
                })
            ).toBe(false);

            // Missing state
            expect(
                isValidResoniteFriendContext({
                    ...baseContext,
                    state: undefined
                })
            ).toBe(false);

            // Missing ref
            expect(
                isValidResoniteFriendContext({ ...baseContext, ref: undefined })
            ).toBe(false);

            // Missing ref.displayName
            expect(
                isValidResoniteFriendContext({
                    ...baseContext,
                    ref: { id: 'resonite:u-123', displayName: undefined }
                })
            ).toBe(false);
        });
    });
});
