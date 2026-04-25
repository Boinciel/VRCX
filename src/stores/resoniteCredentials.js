import { defineStore } from 'pinia';
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useAdvancedSettingsStore } from './settings/advanced';
import { useModalStore } from './modal';
import { useUserStore } from './user';
import { watchState } from '../services/watchState';

import configRepository from '../services/config';
import security from '../services/security';

const RESONITE_DEFAULTS = {
    username: '',
    password: '',
    isPasswordEncrypted: false,
    apiKey: '',
    tokenExpiresAt: 0,
    rememberMe: true,
    rememberUsername: true,
    rememberPassword: false,
    autoRefreshExpiredToken: false
};

/**
 * @typedef {Object} ResoniteCredentialsSaveInput
 * @property {string} [username]
 * @property {string} [password]
 * @property {string} [apiKey]
 * @property {number} [tokenExpiresAt]
 * @property {boolean} [rememberMe]
 * @property {boolean} [rememberUsername]
 * @property {boolean} [rememberPassword]
 * @property {boolean} [autoRefreshExpiredToken]
 */

export const useResoniteCredentialsStore = defineStore(
    'ResoniteCredentials',
    () => {
        const advancedSettingsStore = useAdvancedSettingsStore();
        const modalStore = useModalStore();
        const userStore = useUserStore();
        const { t } = useI18n();

        watch(
            [() => watchState.isLoggedIn, () => userStore.currentUser],
            async ([isLoggedIn, currentUser]) => {
                try {
                    if (isLoggedIn) {
                        await applySavedResoniteCredentialsForCurrentUser(
                            currentUser
                        );
                    } else {
                        await clearActiveResoniteApiKey();
                    }
                } catch (error) {
                    console.error(
                        '[ResoniteIntegration] Failed to sync saved credentials state:',
                        error
                    );
                }
            },
            { flush: 'sync' }
        );

        async function readSavedCredentials() {
            let savedCredentials = {};
            try {
                savedCredentials = JSON.parse(
                    await configRepository.getString('savedCredentials', '{}')
                );
            } catch (error) {
                console.error(
                    '[ResoniteIntegration] Failed reading saved credentials:',
                    error
                );
            }

            return savedCredentials;
        }

        async function writeSavedCredentials(savedCredentials) {
            await configRepository.setString(
                'savedCredentials',
                JSON.stringify(savedCredentials)
            );
        }

        function normalizeResoniteCredentials(entry) {
            return {
                ...RESONITE_DEFAULTS,
                ...(entry || {})
            };
        }

        async function promptPrimaryPasswordKey() {
            const { ok, value } = await modalStore.prompt({
                title: t('prompt.primary_password.header'),
                description: t('prompt.primary_password.description'),
                inputType: 'password',
                pattern: /[\s\S]{1,32}/
            });
            if (!ok) {
                throw new Error('primary password prompt cancelled');
            }
            return value;
        }

        /** @param {ResoniteCredentialsSaveInput} param0 */
        async function saveResoniteCredentialsForCurrentUser({
            username,
            password,
            apiKey,
            tokenExpiresAt,
            rememberMe,
            rememberUsername,
            rememberPassword,
            autoRefreshExpiredToken
        }) {
            if (!watchState.isLoggedIn || !userStore.currentUser?.id) {
                return false;
            }

            const userId = userStore.currentUser.id;
            const savedCredentials = await readSavedCredentials();
            const entry = savedCredentials[userId];

            if (!entry?.loginParams?.password) {
                return false;
            }

            const resonite = normalizeResoniteCredentials(entry.resonite);
            resonite.rememberMe =
                rememberMe === undefined
                    ? resonite.rememberMe !== false
                    : rememberMe !== false;
            resonite.rememberUsername =
                rememberUsername === undefined
                    ? resonite.rememberUsername !== false
                    : rememberUsername !== false;
            resonite.rememberPassword =
                rememberPassword === undefined
                    ? resonite.rememberPassword !== false
                    : rememberPassword !== false;
            resonite.autoRefreshExpiredToken =
                autoRefreshExpiredToken === undefined
                    ? resonite.autoRefreshExpiredToken !== false
                    : autoRefreshExpiredToken !== false;

            resonite.username = resonite.rememberUsername
                ? typeof username === 'string'
                    ? username
                    : String(resonite.username || '')
                : '';
            resonite.apiKey =
                typeof apiKey === 'string'
                    ? apiKey
                    : String(resonite.apiKey || '');
            resonite.tokenExpiresAt =
                tokenExpiresAt === undefined
                    ? Number(resonite.tokenExpiresAt || 0)
                    : Number(tokenExpiresAt || 0);

            if (!resonite.rememberUsername) {
                resonite.autoRefreshExpiredToken = false;
            }

            if (!resonite.rememberPassword) {
                resonite.password = '';
                resonite.isPasswordEncrypted = false;
                resonite.autoRefreshExpiredToken = false;
            } else if (typeof password === 'string' && password) {
                if (advancedSettingsStore.enablePrimaryPassword) {
                    const key = await promptPrimaryPasswordKey();
                    await security.decrypt(entry.loginParams.password, key);
                    resonite.password = await security.encrypt(password, key);
                    resonite.isPasswordEncrypted = true;
                } else {
                    resonite.password = password;
                    resonite.isPasswordEncrypted = false;
                }
            } else if (password === '') {
                resonite.password = '';
                resonite.isPasswordEncrypted = false;
                resonite.autoRefreshExpiredToken = false;
            }

            entry.resonite = resonite;
            await writeSavedCredentials(savedCredentials);
            return true;
        }

        async function getSavedResoniteCredentialsForCurrentUser() {
            if (!watchState.isLoggedIn || !userStore.currentUser?.id) {
                return null;
            }

            const savedCredentials = await readSavedCredentials();
            const entry = savedCredentials[userStore.currentUser.id];
            if (!entry?.resonite) {
                return null;
            }

            return normalizeResoniteCredentials(entry.resonite);
        }

        async function applySavedResoniteCredentialsForCurrentUser(
            currentUser
        ) {
            if (!currentUser?.id) {
                return;
            }

            const savedCredentials = await readSavedCredentials();
            const entry = savedCredentials[currentUser.id];
            const apiKey = entry?.resonite?.apiKey || '';
            if (typeof advancedSettingsStore.setResoniteApiKey === 'function') {
                await advancedSettingsStore.setResoniteApiKey(apiKey);
            }
        }

        async function clearActiveResoniteApiKey() {
            if (typeof advancedSettingsStore.setResoniteApiKey === 'function') {
                await advancedSettingsStore.setResoniteApiKey('');
            }
        }

        async function encryptSavedResonitePasswords(primaryKey) {
            if (!primaryKey) {
                return;
            }

            const savedCredentials = await readSavedCredentials();
            let edited = false;

            for (const userId in savedCredentials) {
                const entry = savedCredentials[userId];
                if (!entry?.resonite?.password) {
                    continue;
                }

                if (entry.resonite.isPasswordEncrypted) {
                    continue;
                }

                entry.resonite.password = await security.encrypt(
                    entry.resonite.password,
                    primaryKey
                );
                entry.resonite.isPasswordEncrypted = true;
                edited = true;
            }

            if (edited) {
                await writeSavedCredentials(savedCredentials);
            }
        }

        async function decryptSavedResonitePasswords(primaryKey) {
            if (!primaryKey) {
                return;
            }

            const savedCredentials = await readSavedCredentials();
            let edited = false;

            for (const userId in savedCredentials) {
                const entry = savedCredentials[userId];
                if (!entry?.resonite?.password) {
                    continue;
                }

                if (!entry.resonite.isPasswordEncrypted) {
                    continue;
                }

                entry.resonite.password = await security.decrypt(
                    entry.resonite.password,
                    primaryKey
                );
                entry.resonite.isPasswordEncrypted = false;
                edited = true;
            }

            if (edited) {
                await writeSavedCredentials(savedCredentials);
            }
        }

        return {
            saveResoniteCredentialsForCurrentUser,
            getSavedResoniteCredentialsForCurrentUser,
            applySavedResoniteCredentialsForCurrentUser,
            clearActiveResoniteApiKey,
            encryptSavedResonitePasswords,
            decryptSavedResonitePasswords
        };
    }
);
