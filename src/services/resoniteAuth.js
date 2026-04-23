import configRepository from './config';
import webApiService from './webapi';
import { useAdvancedSettingsStore } from '../stores/settings/advanced';
import { useResoniteCredentialsStore } from '../stores/resoniteCredentials';
import { watchState } from './watchState';

const RESONITE_USER_SESSIONS_URL = 'https://api.resonite.com/userSessions';
const RESONITE_UID_CONFIG_KEY = 'VRCX_resoniteApiUidHash';
const RESONITE_REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
const RESONITE_NON_REMEMBER_ME_SECONDS = 24 * 60 * 60;
const RESONITE_REFRESH_GRACE_SECONDS = 5 * 60;

/**
 * Build Authorization header value from stored API key format.
 * Supports:
 * - Native Resonite session format: U-xxxx:token -> "res U-xxxx:token"
 * - Preformatted header: "res U-xxxx:token"
 * - Generic API keys for custom proxies -> "Bearer <key>"
 *
 * @param {string} apiKey
 * @returns {string}
 */
export function buildResoniteAuthorizationHeader(apiKey) {
    const key = String(apiKey || '').trim();

    if (!key) {
        return '';
    }

    if (key.toLowerCase().startsWith('res ')) {
        return key;
    }

    if (/^U-[^:\s]+:.+/.test(key)) {
        return `res ${key}`;
    }

    return `Bearer ${key}`;
}

/**
 * Create a Resonite API session using username/password authentication.
 * Returns a user session object containing token and user id.
 *
 * @param {Object} options
 * @param {string} options.username
 * @param {string} options.password
 * @param {string} [options.totp]
 * @param {boolean} [options.rememberMe]
 * @returns {Promise<{userId: string, token: string, apiKey: string, rememberMe: boolean, tokenExpiresAt: number}>}
 */
export async function createResoniteSession(options) {
    const username = String(options?.username || '').trim();
    const password = String(options?.password || '');
    const totp = String(options?.totp || '').trim();
    const rememberMe = options?.rememberMe !== false;

    if (!username || !password) {
        throw new Error('Username and password are required');
    }

    const uid = await getOrCreateResoniteUidHash();
    const headers = {
        'Content-Type': 'application/json',
        UID: uid
    };

    if (totp) {
        headers.TOTP = totp;
    }

    // Resonite API expects "email" key when an email address is used, "username" otherwise
    const credentialKey = username.includes('@') ? 'email' : 'username';

    const secretMachineId = createSecretMachineId();
    const requestBody = {
        [credentialKey]: username,
        authentication: {
            $type: 'password',
            password
        },
        secretMachineId,
        rememberMe
    };

    console.debug('[ResoniteIntegration] Authentication request:', {
        credentialKey,
        username,
        totp: totp ? '(provided)' : '(not provided)',
        rememberMe,
        hasUID: !!headers.UID
    });

    const response = await webApiService.execute({
        url: RESONITE_USER_SESSIONS_URL,
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
    });

    console.debug(
        '[ResoniteIntegration] Authentication response status:',
        response.status
    );

    if (response.status !== 200) {
        console.error(
            '[ResoniteIntegration] Authentication failed with status',
            response.status
        );
        console.error('[ResoniteIntegration] Response body:', response.data);
        const error =
            /** @type {Error & {status: number, responseData: string}} */ (
                new Error(`Resonite login failed: ${response.status}`)
            );
        error.status = response.status;
        error.responseData = String(response.data || '').slice(0, 500);
        throw error;
    }

    let data = null;
    try {
        data = JSON.parse(response.data);
    } catch (e) {
        console.error(
            '[ResoniteIntegration] Failed to parse login response:',
            e,
            'Data:',
            response.data
        );
        throw new Error('Resonite login returned invalid JSON');
    }

    console.debug(
        '[ResoniteIntegration] Login raw response body:',
        response.data
    );
    console.debug('[ResoniteIntegration] Login parsed response object:', data);

    const candidateUserId = [
        data?.userId,
        data?.userID,
        data?.UserId,
        data?.entity?.userId,
        data?.entity?.userID,
        data?.entity?.id,
        data?.user?.id,
        data?.user?.userId,
        data?.id
    ].find((value) => typeof value === 'string' && value.trim() !== '');

    const candidateToken = [
        data?.token,
        data?.Token,
        data?.entity?.token,
        data?.entity?.sessionToken,
        data?.sessionToken,
        data?.session?.token,
        data?.apiKey?.split(':')?.[1]
    ].find((value) => typeof value === 'string' && value.trim() !== '');

    const userId = String(candidateUserId || '').trim();
    const token = String(candidateToken || '').trim();

    if (!userId || !token) {
        console.error(
            '[ResoniteIntegration] Login response missing required fields:',
            {
                userId: !!userId,
                token: !!token,
                keys: data && typeof data === 'object' ? Object.keys(data) : []
            }
        );
        throw new Error('Resonite login response missing userId/token');
    }

    console.debug(
        '[ResoniteIntegration] Authentication successful for userId:',
        userId
    );

    return {
        userId,
        token,
        apiKey: `${userId}:${token}`,
        rememberMe,
        tokenExpiresAt: calculateResoniteTokenExpiry(rememberMe)
    };
}

export function calculateResoniteTokenExpiry(rememberMe = true) {
    const seconds = rememberMe
        ? RESONITE_REMEMBER_ME_SECONDS
        : RESONITE_NON_REMEMBER_ME_SECONDS;
    return Date.now() + seconds * 1000;
}

export function isResoniteTokenExpired(tokenExpiresAt) {
    const expiresAt = Number(tokenExpiresAt || 0);
    if (!expiresAt) {
        return false;
    }

    const refreshAt = expiresAt - RESONITE_REFRESH_GRACE_SECONDS * 1000;
    return Date.now() >= refreshAt;
}

export async function ensureResoniteSessionIsFresh() {
    if (!watchState.isLoggedIn) {
        return false;
    }

    const resoniteCredentialsStore = useResoniteCredentialsStore();
    const advancedSettingsStore = useAdvancedSettingsStore();

    const savedResonite =
        await resoniteCredentialsStore.getSavedResoniteCredentialsForCurrentUser();
    if (!savedResonite?.apiKey) {
        return false;
    }

    if (!isResoniteTokenExpired(savedResonite.tokenExpiresAt)) {
        return false;
    }

    if (!savedResonite.username || !savedResonite.password) {
        return false;
    }

    // Match VRC primary-password behavior: encrypted credentials are not auto-used in background.
    if (savedResonite.isPasswordEncrypted) {
        return false;
    }

    try {
        const rememberMe = savedResonite.rememberMe !== false;
        const session = await createResoniteSession({
            username: savedResonite.username,
            password: savedResonite.password,
            rememberMe
        });

        await advancedSettingsStore.setResoniteApiKey(session.apiKey);
        await resoniteCredentialsStore.saveResoniteCredentialsForCurrentUser({
            username: savedResonite.username,
            password: savedResonite.password,
            apiKey: session.apiKey,
            tokenExpiresAt: calculateResoniteTokenExpiry(rememberMe),
            rememberMe
        });
        return true;
    } catch (error) {
        console.warn(
            '[ResoniteIntegration] Failed to refresh expired token:',
            error
        );
        return false;
    }
}

async function getOrCreateResoniteUidHash() {
    const existing = await configRepository.getString(
        RESONITE_UID_CONFIG_KEY,
        ''
    );
    if (existing) {
        return existing;
    }

    const seed = `${createSecretMachineId()}:${Date.now()}`;
    const hash = await sha256Hex(seed);
    await configRepository.setString(RESONITE_UID_CONFIG_KEY, hash);
    return hash;
}

function createSecretMachineId() {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        (character) => {
            const random = Math.floor(Math.random() * 16);
            const value = character === 'x' ? random : (random & 0x3) | 0x8;
            return value.toString(16);
        }
    );
}

async function sha256Hex(input) {
    if (
        typeof crypto !== 'undefined' &&
        crypto.subtle &&
        typeof TextEncoder !== 'undefined'
    ) {
        const encoded = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest('SHA-256', encoded);
        const digestArray = Array.from(new Uint8Array(digest));
        return digestArray
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    // Fallback only if Web Crypto API is unavailable.
    return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}
