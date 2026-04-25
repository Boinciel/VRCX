import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const {
    mockConfigRepository,
    mockAdvancedSettingsStore,
    mockModalStore,
    mockUserStore,
    mockSecurity,
    mockWatchState
} = vi.hoisted(() => ({
    mockConfigRepository: {
        getString: vi.fn(),
        setString: vi.fn()
    },
    mockAdvancedSettingsStore: {
        enablePrimaryPassword: false,
        setResoniteApiKey: vi.fn()
    },
    mockModalStore: {
        prompt: vi.fn()
    },
    mockUserStore: {
        currentUser: {
            id: 'usr_test'
        }
    },
    mockSecurity: {
        decrypt: vi.fn(async (value) => value),
        encrypt: vi.fn(async (value) => value)
    },
    mockWatchState: {
        isLoggedIn: true
    }
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key) => key
    })
}));

vi.mock('../../services/config', () => ({
    default: mockConfigRepository
}));

vi.mock('../../services/security', () => ({
    default: mockSecurity
}));

vi.mock('../settings/advanced', () => ({
    useAdvancedSettingsStore: () => mockAdvancedSettingsStore
}));

vi.mock('../modal', () => ({
    useModalStore: () => mockModalStore
}));

vi.mock('../user', () => ({
    useUserStore: () => mockUserStore
}));

vi.mock('../../services/watchState', () => ({
    watchState: mockWatchState
}));

import { useResoniteCredentialsStore } from '../resoniteCredentials';

describe('resoniteCredentials store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());
        mockAdvancedSettingsStore.enablePrimaryPassword = false;
        mockWatchState.isLoggedIn = true;
        mockUserStore.currentUser = {
            id: 'usr_test'
        };
        mockConfigRepository.setString.mockResolvedValue(undefined);
    });

    test('clears saved username and password when remember toggles are disabled', async () => {
        mockConfigRepository.getString.mockResolvedValue(
            JSON.stringify({
                usr_test: {
                    loginParams: {
                        password: 'vrchat-password'
                    },
                    resonite: {
                        username: 'SavedUser',
                        password: 'saved-secret',
                        isPasswordEncrypted: false,
                        apiKey: 'U-old:token-one',
                        tokenExpiresAt: 123,
                        rememberMe: true,
                        rememberUsername: true,
                        rememberPassword: true,
                        autoRefreshExpiredToken: true
                    }
                }
            })
        );

        const store = useResoniteCredentialsStore();

        const saved = await store.saveResoniteCredentialsForCurrentUser({
            username: 'NewUser',
            password: 'new-secret',
            apiKey: 'U-new:token-two',
            tokenExpiresAt: 456,
            rememberMe: false,
            rememberUsername: false,
            rememberPassword: false,
            autoRefreshExpiredToken: true
        });

        expect(saved).toBe(true);
        expect(mockConfigRepository.setString).toHaveBeenCalledTimes(1);

        const [, rawSavedCredentials] =
            mockConfigRepository.setString.mock.calls[0];
        const parsed = JSON.parse(rawSavedCredentials);

        expect(parsed.usr_test.resonite).toEqual(
            expect.objectContaining({
                username: '',
                password: '',
                isPasswordEncrypted: false,
                apiKey: 'U-new:token-two',
                tokenExpiresAt: 456,
                rememberMe: false,
                rememberUsername: false,
                rememberPassword: false,
                autoRefreshExpiredToken: false
            })
        );
    });

    test('preserves existing saved password when password is not edited', async () => {
        mockConfigRepository.getString.mockResolvedValue(
            JSON.stringify({
                usr_test: {
                    loginParams: {
                        password: 'vrchat-password'
                    },
                    resonite: {
                        username: 'SavedUser',
                        password: 'saved-secret',
                        isPasswordEncrypted: false,
                        apiKey: 'U-old:token-one',
                        tokenExpiresAt: 123,
                        rememberMe: true,
                        rememberUsername: true,
                        rememberPassword: true,
                        autoRefreshExpiredToken: true
                    }
                }
            })
        );

        const store = useResoniteCredentialsStore();

        await store.saveResoniteCredentialsForCurrentUser({
            username: 'SavedUser',
            apiKey: 'U-refreshed:token-two',
            tokenExpiresAt: 999,
            rememberMe: true,
            rememberUsername: true,
            rememberPassword: true,
            autoRefreshExpiredToken: true
        });

        const [, rawSavedCredentials] =
            mockConfigRepository.setString.mock.calls[0];
        const parsed = JSON.parse(rawSavedCredentials);

        expect(parsed.usr_test.resonite).toEqual(
            expect.objectContaining({
                username: 'SavedUser',
                password: 'saved-secret',
                apiKey: 'U-refreshed:token-two',
                tokenExpiresAt: 999,
                rememberMe: true,
                rememberUsername: true,
                rememberPassword: true,
                autoRefreshExpiredToken: true
            })
        );
    });
});
