import { ref } from 'vue';

import { buildResoniteAuthorizationHeader } from './resoniteAuth';
import configRepository from './config';
import webApiService from './webapi';

const RESONITE_HUB_URL = 'https://api.resonite.com/hub';
const RESONITE_REALTIME_CACHE_VERSION = 1;
const RESONITE_REALTIME_CACHE_MAX_ENTRIES = 200;
const RESONITE_REALTIME_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

let signalRModulePromise = null;
let hubConnection = null;
let connectionApiKey = '';
let persistenceScopeKey = '';
let persistRealtimeCacheTimer = null;
let started = false;
const subscribedUserIds = new Set();
const subscribedSessionBroadcastKeys = new Set();
const presenceByUserId = new Map();
const sessionNameByHash = new Map();
const sessionDataByHash = new Map();
const sessionResolvePromises = new Map();
const sessionResolveMisses = new Map();
const hostSessionsCache = new Map();
const hostSessionsPromises = new Map();
let visibleSessionsCache = {
    fetchedAt: 0,
    sessions: []
};
let visibleSessionsPromise = null;
let presenceListener = null;

export const resoniteSessionCacheVersion = ref(0);

function bumpResoniteSessionCacheVersion() {
    resoniteSessionCacheVersion.value += 1;
}

function setCachedSessionData(sessionHash, sessionPayload) {
    const normalizedHash = String(sessionHash || '').trim();
    if (
        !normalizedHash ||
        !sessionPayload ||
        typeof sessionPayload !== 'object'
    ) {
        return;
    }

    sessionDataByHash.set(normalizedHash, sessionPayload);
    bumpResoniteSessionCacheVersion();
}

function clearSessionCaches() {
    sessionNameByHash.clear();
    sessionDataByHash.clear();
    sessionResolvePromises.clear();
    sessionResolveMisses.clear();
    hostSessionsCache.clear();
    hostSessionsPromises.clear();
    visibleSessionsCache = {
        fetchedAt: 0,
        sessions: []
    };
    visibleSessionsPromise = null;
    bumpResoniteSessionCacheVersion();
}

/**
 * Returns the cached full Resonite session object that was fetched when resolving
 * the given session hash. Returns null if the hash has not been resolved yet.
 * @param {string} sessionHash
 * @returns {object|null}
 */
export function getResoniteSessionByHash(sessionHash) {
    const normalized = String(sessionHash || '').trim();
    return normalized ? (sessionDataByHash.get(normalized) ?? null) : null;
}

/**
 * @param {{ sessionHash?: string, userId?: string, apiKey?: string, force?: boolean }} options
 */
export async function refreshResoniteSessionByHash(options = {}) {
    const { sessionHash, userId = '', apiKey = '', force = false } = options;
    const normalizedHash = String(sessionHash || '').trim();
    const normalizedUserId = stripResonitePrefix(userId);
    const normalizedApiKey = String(apiKey || connectionApiKey || '').trim();

    if (!normalizedHash) {
        return null;
    }

    if (force) {
        sessionResolveMisses.delete(normalizedHash);
        if (normalizedUserId) {
            hostSessionsCache.delete(normalizedUserId);
            hostSessionsPromises.delete(normalizedUserId);
        }
        visibleSessionsCache = {
            fetchedAt: 0,
            sessions: []
        };
        visibleSessionsPromise = null;
    }

    if (!normalizedApiKey) {
        return getResoniteSessionByHash(normalizedHash);
    }

    await resolveSessionNameByHash(normalizedHash, normalizedApiKey);
    return getResoniteSessionByHash(normalizedHash);
}

export async function hydratePersistedResoniteRealtimeState(scopeKey) {
    persistenceScopeKey = normalizeResonitePersistenceScope(scopeKey);
    if (!persistenceScopeKey) {
        return false;
    }

    try {
        const persisted = await configRepository.getObject(
            getResoniteRealtimeCacheKey(persistenceScopeKey)
        );
        if (!persisted || typeof persisted !== 'object') {
            return false;
        }

        const persistedAt = Number(persisted.persistedAt || 0);
        if (
            !persistedAt ||
            Date.now() - persistedAt > RESONITE_REALTIME_CACHE_MAX_AGE_MS
        ) {
            return false;
        }

        const sessionNames = Array.isArray(persisted.sessionNames)
            ? persisted.sessionNames
            : [];
        const sessionData = Array.isArray(persisted.sessionData)
            ? persisted.sessionData
            : [];

        sessionNameByHash.clear();
        sessionDataByHash.clear();

        for (const entry of sessionNames) {
            const sessionHash = String(entry?.sessionHash || '').trim();
            const sessionName = String(entry?.sessionName || '').trim();
            if (sessionHash && sessionName) {
                sessionNameByHash.set(sessionHash, sessionName);
            }
        }

        for (const entry of sessionData) {
            const sessionHash = String(entry?.sessionHash || '').trim();
            const sessionPayload =
                entry?.session && typeof entry.session === 'object'
                    ? entry.session
                    : null;
            if (sessionHash && sessionPayload) {
                sessionDataByHash.set(sessionHash, sessionPayload);
            }
        }

        bumpResoniteSessionCacheVersion();

        return sessionNameByHash.size > 0 || sessionDataByHash.size > 0;
    } catch (error) {
        console.warn(
            '[ResoniteIntegration] Failed to hydrate persisted realtime cache:',
            error
        );
        return false;
    }
}

export async function persistResoniteRealtimeState(
    scopeKey = persistenceScopeKey
) {
    const normalizedScopeKey = normalizeResonitePersistenceScope(scopeKey);
    persistenceScopeKey = normalizedScopeKey;
    if (!normalizedScopeKey) {
        return false;
    }

    try {
        await configRepository.setObject(
            getResoniteRealtimeCacheKey(normalizedScopeKey),
            buildPersistedRealtimeCachePayload()
        );
        return true;
    } catch (error) {
        console.warn(
            '[ResoniteIntegration] Failed to persist realtime cache:',
            error
        );
        return false;
    }
}

export async function clearResoniteRealtimeState(
    scopeKey = persistenceScopeKey
) {
    const normalizedScopeKey = normalizeResonitePersistenceScope(scopeKey);

    if (persistRealtimeCacheTimer) {
        clearTimeout(persistRealtimeCacheTimer);
        persistRealtimeCacheTimer = null;
    }

    clearSessionCaches();

    if (!normalizedScopeKey) {
        return false;
    }

    try {
        await configRepository.remove(
            getResoniteRealtimeCacheKey(normalizedScopeKey)
        );
        if (persistenceScopeKey === normalizedScopeKey) {
            persistenceScopeKey = '';
        }
        return true;
    } catch (error) {
        console.warn(
            '[ResoniteIntegration] Failed to clear realtime cache:',
            error
        );
        return false;
    }
}

export async function ensureResoniteRealtimePresence({
    enabled,
    apiKey,
    contactUserIds = [],
    persistenceKey = ''
}) {
    if (!enabled) {
        await stopResoniteRealtimePresence();
        return false;
    }

    const normalizedApiKey = String(apiKey || '').trim();
    if (!normalizedApiKey) {
        await stopResoniteRealtimePresence();
        return false;
    }

    persistenceScopeKey = normalizeResonitePersistenceScope(persistenceKey);
    const normalizedIds = normalizeDistinctUserIds(contactUserIds);

    try {
        if (!hubConnection || connectionApiKey !== normalizedApiKey) {
            await recreateConnection(normalizedApiKey);
        }

        if (!started) {
            await hubConnection.start();
            started = true;
            console.debug('[ResoniteIntegration] SignalR connected');
            await initializeRealtimeStatus();
        }

        await subscribeToContacts(normalizedIds);
        return true;
    } catch (error) {
        console.warn('[ResoniteIntegration] SignalR setup failed:', error);
        return false;
    }
}

export function mergeResoniteRealtimePresence(resoniteFriendsList) {
    if (
        !Array.isArray(resoniteFriendsList) ||
        resoniteFriendsList.length === 0
    ) {
        return [];
    }

    return resoniteFriendsList.map((friendData) => {
        const userId = stripResonitePrefix(friendData?.id);
        const realtimePresence = presenceByUserId.get(userId);
        if (!realtimePresence) {
            return friendData;
        }

        const rawStatus =
            firstNonEmptyString(
                realtimePresence.onlineStatus,
                friendData?.resonite?.onlineStatus,
                friendData?.ref?.resonite?.onlineStatus,
                friendData?.ref?.status
            ) || 'offline';

        const normalizedRawStatus = normalizeStatus(rawStatus);
        const isOnline = ['online', 'busy', 'away', 'sociable'].includes(
            normalizedRawStatus
        );

        const mappedStatus = mapResoniteStatusToVrcxStatus(
            normalizedRawStatus,
            isOnline
        );

        const privateSessionLabel = getPrivateSessionLabel(
            getCurrentSessionFromList(
                Array.isArray(realtimePresence.sessions)
                    ? realtimePresence.sessions
                    : [],
                Number(firstDefined(realtimePresence.currentSessionIndex, -1))
            )
        );

        const locationName = isOnline
            ? firstNonEmptyString(
                  privateSessionLabel,
                  realtimePresence.currentSessionName,
                  getCachedSessionName(realtimePresence.currentSessionHash),
                  realtimePresence.locationName,
                  friendData?.resonite?.locationName,
                  friendData?.ref?.traveling,
                  sanitizeResoniteLocationFallback(
                      friendData?.ref?.location,
                      isOnline
                  )
              )
            : '';
        const statusDescription = isOnline
            ? firstNonEmptyString(
                  realtimePresence.statusDescription,
                  friendData?.ref?.statusDescription,
                  friendData?.resonite?.profile?.tagline,
                  friendData?.resonite?.profile?.description
              )
            : firstNonEmptyString(realtimePresence.statusDescription);

        const appVersion = firstNonEmptyString(
            realtimePresence.appVersion,
            friendData?.resonite?.appVersion
        );
        const outputDevice = firstNonEmptyString(
            realtimePresence.outputDevice,
            friendData?.resonite?.outputDevice
        );
        const sessionType = firstNonEmptyString(
            realtimePresence.sessionType,
            friendData?.resonite?.sessionType
        );
        const currentSessionName = isOnline
            ? firstNonEmptyString(
                  privateSessionLabel,
                  realtimePresence.currentSessionName,
                  friendData?.resonite?.realtime?.currentSessionName
              )
            : '';
        const currentSessionHash = isOnline
            ? firstNonEmptyString(
                  realtimePresence.currentSessionHash,
                  friendData?.resonite?.realtime?.currentSessionHash
              )
            : '';

        const location = locationName
            ? locationName === 'Private'
                ? 'private'
                : locationName
            : isOnline
              ? privateSessionLabel
                  ? 'private'
                  : ''
              : 'offline';
        const derivedStatusDescription = buildStatusDescription({
            onlineStatus: normalizedRawStatus,
            statusDescription,
            appVersion,
            outputDevice
        });
        const lastPresenceTimestamp = firstNonEmptyString(
            realtimePresence.lastPresenceTimestamp,
            friendData?.resonite?.realtime?.lastPresenceTimestamp
        );
        const lastStatusChange = firstNonEmptyString(
            realtimePresence.lastStatusChange,
            friendData?.resonite?.realtime?.lastStatusChange
        );
        const lastActivity = firstValidTimestampString(
            lastStatusChange,
            lastPresenceTimestamp,
            friendData?.ref?.last_activity,
            friendData?.resonite?.realtime?.lastStatusChange,
            friendData?.resonite?.realtime?.lastPresenceTimestamp
        );
        const lastLogin = firstValidTimestampString(
            lastPresenceTimestamp,
            lastStatusChange,
            friendData?.ref?.last_login,
            friendData?.resonite?.realtime?.lastPresenceTimestamp,
            friendData?.resonite?.realtime?.lastStatusChange
        );

        const realtimeSnapshot = {
            userId,
            onlineStatus: normalizedRawStatus,
            userSessionId: firstNonEmptyString(
                realtimePresence.userSessionId,
                friendData?.resonite?.realtime?.userSessionId,
                friendData?.resonite?.userSessionId
            ),
            sessionType,
            outputDevice,
            appVersion,
            compatibilityHash: firstNonEmptyString(
                realtimePresence.compatibilityHash,
                friendData?.resonite?.realtime?.compatibilityHash,
                friendData?.resonite?.compatibilityHash
            ),
            isPresent: Boolean(
                firstDefined(
                    realtimePresence.isPresent,
                    friendData?.resonite?.realtime?.isPresent,
                    friendData?.resonite?.isPresent
                )
            ),
            currentSessionIndex: Number(
                firstDefined(
                    realtimePresence.currentSessionIndex,
                    friendData?.resonite?.realtime?.currentSessionIndex,
                    -1
                )
            ),
            currentSessionName,
            currentSessionHash,
            lastPresenceTimestamp,
            lastStatusChange,
            sessions: Array.isArray(realtimePresence.sessions)
                ? realtimePresence.sessions
                : Array.isArray(friendData?.resonite?.realtime?.sessions)
                  ? friendData.resonite.realtime.sessions
                  : [],
            sourceEvent: firstNonEmptyString(
                realtimePresence.sourceEvent,
                friendData?.resonite?.realtime?.sourceEvent
            )
        };

        return {
            ...friendData,
            state: isOnline ? 'online' : 'offline',
            status: mappedStatus,
            ref: {
                ...friendData.ref,
                state: isOnline ? 'online' : 'offline',
                status: mappedStatus,
                location,
                traveling: locationName || '',
                statusDescription: derivedStatusDescription,
                last_activity: lastActivity,
                last_login: lastLogin,
                resonite: {
                    ...(friendData?.ref?.resonite || {}),
                    onlineStatus: normalizedRawStatus,
                    locationName,
                    appVersion,
                    outputDevice,
                    sessionType,
                    currentSessionName,
                    currentSessionHash,
                    isPresent: realtimeSnapshot.isPresent,
                    userSessionId: realtimeSnapshot.userSessionId,
                    compatibilityHash: realtimeSnapshot.compatibilityHash,
                    realtime: realtimeSnapshot
                }
            },
            resonite: {
                ...friendData.resonite,
                onlineStatus: normalizedRawStatus,
                locationName,
                appVersion,
                outputDevice,
                sessionType,
                currentSessionName,
                currentSessionHash,
                isPresent: realtimeSnapshot.isPresent,
                userSessionId: realtimeSnapshot.userSessionId,
                compatibilityHash: realtimeSnapshot.compatibilityHash,
                realtime: realtimeSnapshot
            }
        };
    });
}

export function setResoniteRealtimePresenceListener(listener) {
    presenceListener = typeof listener === 'function' ? listener : null;
}

export async function stopResoniteRealtimePresence() {
    if (persistRealtimeCacheTimer) {
        clearTimeout(persistRealtimeCacheTimer);
        persistRealtimeCacheTimer = null;
    }
    subscribedUserIds.clear();
    subscribedSessionBroadcastKeys.clear();
    presenceByUserId.clear();
    sessionNameByHash.clear();
    sessionDataByHash.clear();
    sessionResolvePromises.clear();
    sessionResolveMisses.clear();
    hostSessionsCache.clear();
    hostSessionsPromises.clear();
    visibleSessionsCache = {
        fetchedAt: 0,
        sessions: []
    };
    visibleSessionsPromise = null;

    if (!hubConnection) {
        started = false;
        connectionApiKey = '';
        return;
    }

    try {
        if (started) {
            await hubConnection.stop();
        }
    } catch (error) {
        console.warn('[ResoniteIntegration] SignalR stop failed:', error);
    }

    hubConnection = null;
    started = false;
    connectionApiKey = '';
}

async function recreateConnection(apiKey) {
    await stopResoniteRealtimePresence();

    const signalR = await loadSignalRModule();
    const authHeader = buildResoniteAuthorizationHeader(apiKey);

    const connection = new signalR.HubConnectionBuilder()
        .withUrl(RESONITE_HUB_URL, {
            headers: {
                Authorization: authHeader
            },
            withCredentials: false,
            transport: signalR.HttpTransportType.LongPolling,
            skipNegotiation: false
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build();

    connection.on('ReceiveStatusUpdate', (...args) => {
        handleRealtimeEvent('ReceiveStatusUpdate', args);
    });
    connection.on('ReceiveSessionUpdate', (...args) => {
        handleRealtimeEvent('ReceiveSessionUpdate', args);
    });
    connection.on('RemoveSession', (...args) => {
        handleRealtimeEvent('RemoveSession', args);
    });

    connection.onreconnected(async () => {
        console.debug('[ResoniteIntegration] SignalR reconnected');
        await initializeRealtimeStatus();
        await subscribeToContacts(Array.from(subscribedUserIds));
    });

    connection.onclose((error) => {
        started = false;
        if (error) {
            console.warn(
                '[ResoniteIntegration] SignalR closed with error:',
                error
            );
        } else {
            console.debug('[ResoniteIntegration] SignalR closed');
        }
    });

    hubConnection = connection;
    connectionApiKey = apiKey;
}

async function initializeRealtimeStatus() {
    if (!hubConnection || !started) {
        return;
    }

    const initializePayload = await safeInvokeForResult('InitializeStatus');
    applyInitializeStatusSnapshot(initializePayload);
    await requestAllContactStatuses();
}

async function subscribeToContacts(contactUserIds) {
    if (!hubConnection || !started) {
        return;
    }

    for (const userId of contactUserIds) {
        if (!userId || subscribedUserIds.has(userId)) {
            continue;
        }

        subscribedUserIds.add(userId);

        await safeInvoke(
            'ListenOnContact',
            userId,
            { userId },
            { contactUserId: userId }
        );
    }
}

async function requestAllContactStatuses() {
    if (!hubConnection || !started) {
        return false;
    }

    // ReCon requests all contacts with [null, isInvisible]. We do not currently
    // track a Resonite invisible state for the local user, so false is the best
    // available value here.
    return safeInvoke('RequestStatus', [null, false]);
}

function applyInitializeStatusSnapshot(payload) {
    const contacts = Array.isArray(payload?.contacts)
        ? payload.contacts
        : Array.isArray(payload)
          ? payload
          : [];

    for (const contact of contacts) {
        const userId = normalizeResoniteUserId(
            firstNonEmptyString(
                contact?.id,
                contact?.userId,
                contact?.contactUserId,
                contact?.entity?.id,
                contact?.entity?.userId
            )
        );

        const userStatus =
            contact?.userStatus && typeof contact.userStatus === 'object'
                ? contact.userStatus
                : null;

        if (!userId || !userStatus) {
            continue;
        }

        const mergedPresence = buildMergedPresence(
            userId,
            {
                userId,
                ...userStatus
            },
            presenceByUserId.get(userId)
        );

        presenceByUserId.set(userId, mergedPresence);
        void subscribeToSessionBroadcastKeys(mergedPresence.sessions);
        void hydrateRealtimeSessionNames(userId, mergedPresence);
    }
}

function handleRealtimeEvent(eventName, args) {
    if (eventName === 'ReceiveSessionUpdate') {
        handleRealtimeSessionUpdate(args);
        return;
    }

    if (
        eventName === 'RemoveSession' &&
        typeof args?.[0] === 'string' &&
        String(args[0]).startsWith('S-')
    ) {
        // RemoveSession currently arrives as sessionId + timestamp, not user presence.
        return;
    }

    const eventObject = extractEventObject(args);
    if (!eventObject) {
        return;
    }

    const userId = firstNonEmptyString(
        eventObject.userId,
        eventObject.contactUserId,
        eventObject.id,
        eventObject.user?.id,
        eventObject.contact?.id,
        eventObject.entity?.id,
        eventObject.entity?.userId
    );

    if (!userId) {
        return;
    }

    const normalizedUserId = normalizeResoniteUserId(userId);
    if (!looksLikeResoniteUserId(normalizedUserId)) {
        return;
    }

    const merged = buildMergedPresence(
        normalizedUserId,
        eventObject,
        presenceByUserId.get(normalizedUserId),
        eventName
    );

    presenceByUserId.set(normalizedUserId, merged);
    void subscribeToSessionBroadcastKeys(merged.sessions);
    void hydrateRealtimeSessionNames(normalizedUserId, merged);

    const logPayload = {
        eventName,
        args,
        extractedEvent: eventObject,
        mergedPresence: {
            userId: normalizedUserId,
            onlineStatus: merged.onlineStatus,
            statusDescription: merged.statusDescription,
            locationName: merged.locationName,
            appVersion: merged.appVersion,
            sessionType: merged.sessionType,
            outputDevice: merged.outputDevice,
            userSessionId: merged.userSessionId,
            compatibilityHash: merged.compatibilityHash,
            isPresent: merged.isPresent,
            currentSessionIndex: merged.currentSessionIndex,
            currentSessionName: merged.currentSessionName,
            currentSessionHash: merged.currentSessionHash,
            sessionCount: Array.isArray(merged.sessions)
                ? merged.sessions.length
                : 0
        }
    };

    console.debug(
        '[ResoniteIntegration] SignalR presence update:',
        JSON.stringify(logPayload, null, 2)
    );

    if (presenceListener) {
        try {
            presenceListener({
                eventName,
                userId: normalizedUserId,
                presence: { ...merged },
                event: eventObject,
                args
            });
        } catch (error) {
            console.warn(
                '[ResoniteIntegration] SignalR presence listener failed:',
                error
            );
        }
    }
}

function handleRealtimeSessionUpdate(args) {
    const sessionUpdate = extractEventObject(args);
    if (!sessionUpdate) {
        return;
    }

    const sessionName = extractSessionDisplayName(sessionUpdate);
    const broadcastKey = String(sessionUpdate.broadcastKey || '').trim();
    if (!sessionName || !broadcastKey) {
        return;
    }

    let updatedAny = false;

    for (const [userId, existingPresence] of presenceByUserId.entries()) {
        if (!existingPresence) {
            continue;
        }

        const sessionHashes = [];
        for (const session of existingPresence.sessions || []) {
            if (String(session?.broadcastKey || '').trim() !== broadcastKey) {
                continue;
            }

            const sessionHash = String(session?.sessionHash || '').trim();
            if (sessionHash) {
                sessionHashes.push(sessionHash);
                sessionNameByHash.set(sessionHash, sessionName);
                setCachedSessionData(sessionHash, sessionUpdate);
                sessionResolveMisses.delete(sessionHash);
            }
        }

        if (sessionHashes.length === 0) {
            continue;
        }

        const existingHash = String(
            existingPresence.currentSessionHash || ''
        ).trim();
        const preferredHash = sessionHashes.includes(existingHash)
            ? existingHash
            : sessionHashes[0];

        const nextPresence = {
            ...existingPresence,
            currentSessionHash: preferredHash,
            sourceEvent: 'ReceiveSessionUpdate',
            locationName: firstNonEmptyString(
                sessionName,
                existingPresence.locationName
            ),
            currentSessionName: firstNonEmptyString(
                sessionName,
                existingPresence.currentSessionName
            )
        };

        presenceByUserId.set(userId, nextPresence);
        updatedAny = true;

        if (presenceListener) {
            try {
                presenceListener({
                    eventName: 'ReceiveSessionUpdate',
                    userId,
                    presence: { ...nextPresence },
                    event: {
                        ...sessionUpdate,
                        currentSessionHash: preferredHash,
                        currentSessionName: sessionName
                    },
                    args
                });
            } catch (error) {
                console.warn(
                    '[ResoniteIntegration] SignalR presence listener failed after session update hydration:',
                    error
                );
            }
        }
    }

    if (updatedAny) {
        schedulePersistResoniteRealtimeState();
        console.debug(
            '[ResoniteIntegration] Applied realtime session update to cached presence:',
            JSON.stringify({ broadcastKey, sessionName })
        );
    }
}

function extractEventObject(args) {
    if (!Array.isArray(args) || args.length === 0) {
        return null;
    }

    const objectArg = args.find(
        (value) => value && typeof value === 'object' && !Array.isArray(value)
    );

    if (objectArg) {
        const firstStringArg = args.find((value) => typeof value === 'string');
        if (firstStringArg && !objectArg.userId && !objectArg.contactUserId) {
            return {
                ...objectArg,
                userId: firstStringArg
            };
        }
        return objectArg;
    }

    const firstStringArg = args.find((value) => typeof value === 'string');
    if (firstStringArg) {
        return { userId: firstStringArg };
    }

    return null;
}

function hasExplicitPresenceLocationData(eventObject) {
    if (!eventObject || typeof eventObject !== 'object') {
        return false;
    }

    if (
        firstNonEmptyString(
            eventObject.locationName,
            eventObject.location,
            eventObject.sessionName,
            eventObject.currentSession?.sessionHash,
            eventObject.currentSession?.name,
            eventObject.currentSession?.sessionName,
            eventObject.currentSession?.locationName,
            eventObject.session?.sessionHash,
            eventObject.session?.name,
            eventObject.session?.sessionName,
            eventObject.session?.locationName,
            eventObject.userStatus?.locationName,
            eventObject.userStatus?.currentSessionHash,
            eventObject.userStatus?.currentSessionName
        )
    ) {
        return true;
    }

    if (
        Array.isArray(eventObject.sessions) ||
        Array.isArray(eventObject.userStatus?.sessions)
    ) {
        return true;
    }

    const currentSessionIndex = firstDefined(
        eventObject.currentSessionIndex,
        eventObject.userStatus?.currentSessionIndex
    );

    return Number.isInteger(Number(currentSessionIndex));
}

export function buildMergedPresence(
    normalizedUserId,
    eventObject,
    previousPresence,
    sourceEvent = 'InitializeStatus'
) {
    const normalizedStatus =
        normalizeStatus(
            firstDefined(
                eventObject.onlineStatus,
                eventObject.status,
                eventObject.userStatus?.onlineStatus,
                eventObject.entity?.onlineStatus,
                eventObject.entity?.status,
                previousPresence?.onlineStatus
            )
        ) || 'offline';

    const currentSessionIndex = Number(
        firstDefined(
            eventObject.currentSessionIndex,
            eventObject.userStatus?.currentSessionIndex,
            previousPresence?.currentSessionIndex,
            -1
        )
    );

    const sessions = Array.isArray(eventObject.sessions)
        ? eventObject.sessions
        : Array.isArray(eventObject.userStatus?.sessions)
          ? eventObject.userStatus.sessions
          : Array.isArray(previousPresence?.sessions)
            ? previousPresence.sessions
            : [];

    const currentSession = getCurrentSessionFromList(
        sessions,
        currentSessionIndex
    );
    const hasLocationData = hasExplicitPresenceLocationData(eventObject);
    const sessionPrivacyLabel = getPrivateSessionLabel(currentSession);
    const currentSessionName = firstNonEmptyString(
        sessionPrivacyLabel,
        extractSessionDisplayName(eventObject.currentSession),
        extractSessionDisplayName(eventObject.session),
        extractSessionDisplayName(currentSession),
        hasLocationData ? previousPresence?.currentSessionName : ''
    );
    const currentSessionHash = firstNonEmptyString(
        eventObject.currentSession?.sessionHash,
        eventObject.session?.sessionHash,
        currentSession?.sessionHash,
        hasLocationData ? previousPresence?.currentSessionHash : ''
    );

    return {
        userId: normalizedUserId,
        onlineStatus: normalizedStatus,
        statusDescription: firstNonEmptyString(
            eventObject.statusDescription,
            eventObject.statusMessage,
            eventObject.profile?.tagline,
            eventObject.profile?.description,
            previousPresence?.statusDescription
        ),
        locationName: firstNonEmptyString(
            sessionPrivacyLabel,
            eventObject.locationName,
            eventObject.location,
            eventObject.sessionName,
            eventObject.currentSession?.name,
            eventObject.currentSession?.sessionName,
            eventObject.currentSession?.locationName,
            eventObject.session?.name,
            eventObject.session?.sessionName,
            currentSessionName,
            hasLocationData ? previousPresence?.locationName : ''
        ),
        appVersion: firstNonEmptyString(
            eventObject.appVersion,
            eventObject.userStatus?.appVersion,
            eventObject.currentSession?.appVersion,
            eventObject.session?.appVersion,
            previousPresence?.appVersion
        ),
        outputDevice: firstNonEmptyString(
            eventObject.outputDevice,
            eventObject.userStatus?.outputDevice,
            previousPresence?.outputDevice
        ),
        sessionType: firstNonEmptyString(
            eventObject.sessionType,
            eventObject.userStatus?.sessionType,
            previousPresence?.sessionType
        ),
        userSessionId: firstNonEmptyString(
            eventObject.userSessionId,
            eventObject.currentSession?.sessionId,
            eventObject.session?.sessionId,
            previousPresence?.userSessionId
        ),
        compatibilityHash: firstNonEmptyString(
            eventObject.compatibilityHash,
            eventObject.userStatus?.compatibilityHash,
            previousPresence?.compatibilityHash
        ),
        hashSalt: firstNonEmptyString(
            eventObject.hashSalt,
            eventObject.userStatus?.hashSalt,
            previousPresence?.hashSalt
        ),
        isPresent: Boolean(
            firstDefined(
                eventObject.isPresent,
                eventObject.userStatus?.isPresent,
                previousPresence?.isPresent,
                false
            )
        ),
        currentSessionIndex,
        currentSessionName,
        currentSessionHash,
        lastPresenceTimestamp: firstNonEmptyString(
            eventObject.lastPresenceTimestamp,
            eventObject.userStatus?.lastPresenceTimestamp,
            previousPresence?.lastPresenceTimestamp
        ),
        lastStatusChange: firstNonEmptyString(
            eventObject.lastStatusChange,
            eventObject.userStatus?.lastStatusChange,
            previousPresence?.lastStatusChange
        ),
        sessions,
        updatedAt: Date.now(),
        sourceEvent
    };
}

async function subscribeToSessionBroadcastKeys(sessions) {
    if (!hubConnection || !started || !Array.isArray(sessions)) {
        return;
    }

    for (const session of sessions) {
        const broadcastKey = String(session?.broadcastKey || '').trim();
        if (!broadcastKey || subscribedSessionBroadcastKeys.has(broadcastKey)) {
            continue;
        }

        subscribedSessionBroadcastKeys.add(broadcastKey);
        await safeInvoke('ListenOnKey', broadcastKey);
    }
}

async function safeInvoke(methodName, ...candidateArgs) {
    if (!hubConnection || !started) {
        return false;
    }

    const normalizedCandidates =
        candidateArgs.length > 0 ? candidateArgs : [undefined];

    for (const args of normalizedCandidates) {
        try {
            if (typeof args === 'undefined') {
                await hubConnection.invoke(methodName);
            } else if (Array.isArray(args)) {
                await hubConnection.invoke(methodName, ...args);
            } else {
                await hubConnection.invoke(methodName, args);
            }
            return true;
        } catch {
            // Continue trying alternate signatures.
        }
    }

    console.warn(
        `[ResoniteIntegration] SignalR invoke failed for ${methodName} with all candidate signatures`
    );
    return false;
}

async function safeInvokeForResult(methodName, ...candidateArgs) {
    if (!hubConnection || !started) {
        return null;
    }

    const normalizedCandidates =
        candidateArgs.length > 0 ? candidateArgs : [undefined];

    for (const args of normalizedCandidates) {
        try {
            if (typeof args === 'undefined') {
                return await hubConnection.invoke(methodName);
            }
            if (Array.isArray(args)) {
                return await hubConnection.invoke(methodName, ...args);
            }
            return await hubConnection.invoke(methodName, args);
        } catch {
            // Continue trying alternate signatures.
        }
    }

    console.warn(
        `[ResoniteIntegration] SignalR invoke with result failed for ${methodName} with all candidate signatures`
    );
    return null;
}

async function loadSignalRModule() {
    if (!signalRModulePromise) {
        signalRModulePromise = import('@microsoft/signalr');
    }
    return signalRModulePromise;
}

function normalizeDistinctUserIds(ids) {
    const distinct = new Set();

    for (const id of ids || []) {
        const normalized = normalizeResoniteUserId(id);
        if (normalized) {
            distinct.add(normalized);
        }
    }

    return Array.from(distinct);
}

function normalizeResoniteUserId(value) {
    const raw = stripResonitePrefix(value);
    return String(raw || '').trim();
}

function stripResonitePrefix(id) {
    const value = String(id || '');
    return value.startsWith('resonite:')
        ? value.slice('resonite:'.length)
        : value;
}

function normalizeStatus(value) {
    if (typeof value === 'number') {
        return (
            ['offline', 'invisible', 'away', 'busy', 'online', 'sociable'][
                value
            ] || ''
        );
    }

    return String(value || '')
        .trim()
        .toLowerCase();
}

function mapResoniteStatusToVrcxStatus(status, isOnline) {
    const normalized = String(status || '')
        .trim()
        .toLowerCase();

    if (!isOnline || normalized === 'offline' || normalized === 'invisible') {
        return '';
    }

    if (normalized === 'sociable') {
        return 'join me';
    }
    if (normalized === 'busy') {
        return 'busy';
    }
    if (normalized === 'away') {
        return 'ask me';
    }
    return 'active';
}

function buildStatusDescription({
    onlineStatus,
    statusDescription,
    appVersion,
    outputDevice
}) {
    const explicit = firstNonEmptyString(statusDescription);
    if (explicit) {
        return explicit;
    }

    const normalizedStatus = normalizeStatus(onlineStatus);
    const version = firstNonEmptyString(appVersion);
    const device = normalizeOutputDeviceLabel(outputDevice);

    if (
        version &&
        ['online', 'sociable', 'away', 'busy'].includes(normalizedStatus)
    ) {
        if (version.toLowerCase().includes(' of ')) {
            return `Online on version ${version}`;
        }
        return device
            ? `Online on version ${version} of ${device}`
            : `Online on version ${version}`;
    }

    return '';
}

function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    return undefined;
}

function firstNonEmptyString(...values) {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (normalized) {
            return normalized;
        }
    }

    return '';
}

function firstValidTimestampString(...values) {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            continue;
        }

        const parsed = Date.parse(normalized);
        if (Number.isFinite(parsed)) {
            return new Date(parsed).toJSON();
        }
    }

    return '';
}

function sanitizeResoniteLocationFallback(location, isOnline) {
    const normalized = String(location || '').trim();
    if (!normalized) {
        return '';
    }

    if (isOnline && normalized === 'offline') {
        return '';
    }

    return normalized;
}

function looksLikeResoniteUserId(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return normalized.startsWith('u-');
}

function getCurrentSessionFromList(sessions, currentSessionIndex) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return null;
    }

    if (
        Number.isInteger(currentSessionIndex) &&
        currentSessionIndex >= 0 &&
        currentSessionIndex < sessions.length
    ) {
        return sessions[currentSessionIndex];
    }

    return null;
}

function extractSessionDisplayName(session) {
    if (!session || typeof session !== 'object') {
        return '';
    }

    return firstNonEmptyString(
        session.name,
        session.sessionName,
        session.locationName,
        session.worldName,
        session.world?.name,
        session.title,
        session.friendlyName
    );
}

function getPrivateSessionLabel(session) {
    const accessLevel = String(session?.accessLevel || '')
        .trim()
        .toLowerCase();
    return accessLevel === 'private' ? 'Private' : '';
}

function getCachedSessionName(sessionHash) {
    const normalizedHash = String(sessionHash || '').trim();
    if (!normalizedHash) {
        return '';
    }

    return String(sessionNameByHash.get(normalizedHash) || '').trim();
}

async function hydrateRealtimeSessionNames(userId, presence) {
    const preferredTargets = collectPreferredSessionTargets(presence);
    if (preferredTargets.length === 0 || !connectionApiKey) {
        return;
    }

    let hasNewNames = await hydrateSessionNamesFromHostSessions(
        userId,
        presence,
        preferredTargets
    );

    if (
        await hydrateSessionNamesFromVisibleSessions(
            presenceByUserId.get(userId) || presence,
            preferredTargets
        )
    ) {
        hasNewNames = true;
    }

    const unresolvedHashes = preferredTargets
        .map((target) => target.sessionHash)
        .filter(
            (sessionHash) => sessionHash && !sessionNameByHash.has(sessionHash)
        );

    for (const sessionHash of unresolvedHashes) {
        const resolvedName = await resolveSessionNameByHash(
            sessionHash,
            connectionApiKey
        );
        if (resolvedName) {
            sessionNameByHash.set(sessionHash, resolvedName);
            hasNewNames = true;
            console.debug(
                '[ResoniteIntegration] Resolved session hash to name:',
                JSON.stringify({ sessionHash, resolvedName })
            );
        }
    }

    if (!hasNewNames) {
        return;
    }

    const existing = presenceByUserId.get(userId);
    if (!existing) {
        return;
    }

    const preferredHash = firstNonEmptyString(
        existing.currentSessionHash,
        collectSessionHashesFromPresence(existing)[0]
    );
    const resolvedName = getCachedSessionName(preferredHash);
    if (!resolvedName) {
        return;
    }

    const preferResolvedName = existing.sourceEvent !== 'ReceiveSessionUpdate';
    const updatedPresence = {
        ...existing,
        sourceEvent: preferResolvedName
            ? 'ResolvedSessionName'
            : existing.sourceEvent,
        locationName: preferResolvedName
            ? firstNonEmptyString(resolvedName, existing.locationName)
            : firstNonEmptyString(existing.locationName, resolvedName),
        currentSessionName: preferResolvedName
            ? firstNonEmptyString(resolvedName, existing.currentSessionName)
            : firstNonEmptyString(existing.currentSessionName, resolvedName)
    };

    presenceByUserId.set(userId, updatedPresence);

    if (presenceListener) {
        try {
            presenceListener({
                eventName: 'ResolvedSessionName',
                userId,
                presence: { ...updatedPresence },
                event: {
                    userId,
                    currentSessionHash: preferredHash,
                    currentSessionName: resolvedName
                },
                args: []
            });
        } catch (error) {
            console.warn(
                '[ResoniteIntegration] SignalR presence listener failed after session name resolution:',
                error
            );
        }
    }
}

function collectPreferredSessionTargets(presence) {
    const sessions = Array.isArray(presence?.sessions) ? presence.sessions : [];
    const currentSessionHash = String(
        presence?.currentSessionHash || ''
    ).trim();
    const currentSession = getCurrentSessionMetadata(presence);
    const targets = [];
    const seen = new Set();

    function addTarget(sessionHash, broadcastKey) {
        const normalizedHash = String(sessionHash || '').trim();
        const normalizedBroadcastKey = String(broadcastKey || '').trim();
        if (!normalizedHash) {
            return;
        }

        const dedupeKey = `${normalizedHash}:${normalizedBroadcastKey}`;
        if (seen.has(dedupeKey)) {
            return;
        }

        seen.add(dedupeKey);
        targets.push({
            sessionHash: normalizedHash,
            broadcastKey: normalizedBroadcastKey
        });
    }

    addTarget(currentSessionHash, currentSession?.broadcastKey);

    if (targets.length > 0) {
        return targets;
    }

    for (const session of sessions) {
        addTarget(session?.sessionHash, session?.broadcastKey);
    }

    return targets;
}

function getCurrentSessionMetadata(presence) {
    const sessions = Array.isArray(presence?.sessions) ? presence.sessions : [];
    const currentSessionIndex = Number(presence?.currentSessionIndex);

    if (
        Number.isInteger(currentSessionIndex) &&
        currentSessionIndex >= 0 &&
        currentSessionIndex < sessions.length
    ) {
        return sessions[currentSessionIndex];
    }

    const currentSessionHash = String(
        presence?.currentSessionHash || ''
    ).trim();
    if (!currentSessionHash) {
        return null;
    }

    return (
        sessions.find(
            (session) =>
                String(session?.sessionHash || '').trim() === currentSessionHash
        ) || null
    );
}

function collectSessionHashesFromPresence(presence) {
    const hashes = new Set();

    const currentHash = String(presence?.currentSessionHash || '').trim();
    if (currentHash) {
        hashes.add(currentHash);
    }

    for (const session of presence?.sessions || []) {
        const sessionHash = String(session?.sessionHash || '').trim();
        if (sessionHash) {
            hashes.add(sessionHash);
        }
    }

    return Array.from(hashes);
}

async function hydrateSessionNamesFromHostSessions(
    userId,
    presence,
    preferredTargets = collectPreferredSessionTargets(presence)
) {
    const unresolvedHashes = preferredTargets
        .map((target) => target.sessionHash)
        .filter((hash) => hash && !sessionNameByHash.has(hash));
    if (unresolvedHashes.length === 0) {
        return false;
    }

    const hashSalt = String(presence?.hashSalt || '').trim();
    if (!hashSalt) {
        return false;
    }

    const effectiveApiKey = String(
        presence?.apiKey || connectionApiKey || ''
    ).trim();
    if (!effectiveApiKey) {
        return false;
    }

    const sessions = await fetchHostSessions(userId, effectiveApiKey);
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return false;
    }

    const unresolvedSet = new Set(unresolvedHashes);
    let resolvedAny = false;
    for (const session of sessions) {
        const sessionId = getSessionId(session);
        if (!sessionId) {
            continue;
        }

        const hashedId = await sha256UpperHex(`${sessionId}${hashSalt}`);
        if (!hashedId || !unresolvedSet.has(hashedId)) {
            continue;
        }

        const resolvedName = extractSessionDisplayName(session);
        if (!resolvedName) {
            continue;
        }

        sessionNameByHash.set(hashedId, resolvedName);
        setCachedSessionData(hashedId, session);
        resolvedAny = true;
        console.debug(
            '[ResoniteIntegration] Resolved session hash via host sessions lookup:',
            JSON.stringify({
                userId,
                sessionId,
                sessionHash: hashedId,
                resolvedName
            })
        );
    }

    if (resolvedAny) {
        schedulePersistResoniteRealtimeState();
    }

    return resolvedAny;
}

async function hydrateSessionNamesFromVisibleSessions(
    presence,
    preferredTargets = collectPreferredSessionTargets(presence)
) {
    const unresolvedTargets = preferredTargets.filter(
        (target) =>
            target?.sessionHash && !sessionNameByHash.has(target.sessionHash)
    );
    const effectiveApiKey = String(
        presence?.apiKey || connectionApiKey || ''
    ).trim();
    if (unresolvedTargets.length === 0 || !effectiveApiKey) {
        return false;
    }

    const sessions = await fetchVisibleSessions(effectiveApiKey);
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return false;
    }

    const currentHashSalt = String(presence?.hashSalt || '').trim();
    let resolvedAny = false;

    for (const target of unresolvedTargets) {
        const matchingSession = await findVisibleSessionMatch(
            sessions,
            target,
            currentHashSalt
        );
        if (!matchingSession) {
            continue;
        }

        const resolvedName = extractSessionDisplayName(matchingSession);
        if (!resolvedName) {
            continue;
        }

        sessionNameByHash.set(target.sessionHash, resolvedName);
        setCachedSessionData(target.sessionHash, matchingSession);
        sessionResolveMisses.delete(target.sessionHash);
        resolvedAny = true;
        console.debug(
            '[ResoniteIntegration] Resolved session hash via visible sessions lookup:',
            JSON.stringify({
                sessionHash: target.sessionHash,
                broadcastKey: target.broadcastKey,
                resolvedName
            })
        );
    }

    if (resolvedAny) {
        schedulePersistResoniteRealtimeState();
    }

    return resolvedAny;
}

async function fetchHostSessions(userId, apiKey) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId || !apiKey) {
        return [];
    }

    const now = Date.now();
    const cacheEntry = hostSessionsCache.get(normalizedUserId);
    if (cacheEntry && now - cacheEntry.fetchedAt < 30_000) {
        return cacheEntry.sessions;
    }

    if (hostSessionsPromises.has(normalizedUserId)) {
        return hostSessionsPromises.get(normalizedUserId);
    }

    const promise = (async () => {
        const headers = {
            Authorization: buildResoniteAuthorizationHeader(apiKey)
        };
        const encodedUserId = encodeURIComponent(normalizedUserId);
        const candidateUrls = [
            `https://api.resonite.com/sessions?hostId=${encodedUserId}&includeEmptyHeadless=true&includeEnded=true&minActiveUsers=0`,
            `https://api.resonite.com/sessions?hostUserId=${encodedUserId}&includeEmptyHeadless=true&includeEnded=true&minActiveUsers=0`,
            'https://api.resonite.com/sessions?includeEmptyHeadless=true&includeEnded=true&minActiveUsers=0'
        ];

        for (const url of candidateUrls) {
            try {
                const response = await webApiService.execute({
                    url,
                    method: 'GET',
                    headers
                });
                if (response.status !== 200 || !response.data) {
                    continue;
                }

                const payload = tryParseJson(response.data);
                const sessions = normalizeSessionsArray(payload);
                if (sessions.length === 0) {
                    continue;
                }

                const filtered = sessions.filter((session) => {
                    const hostId = String(
                        session?.hostUserId || session?.hostId || ''
                    ).trim();
                    return !hostId || hostId === normalizedUserId;
                });

                const result = filtered.length > 0 ? filtered : sessions;
                hostSessionsCache.set(normalizedUserId, {
                    fetchedAt: Date.now(),
                    sessions: result
                });

                console.debug(
                    '[ResoniteIntegration] Host sessions lookup response:',
                    JSON.stringify({
                        userId: normalizedUserId,
                        url,
                        totalSessions: sessions.length,
                        filteredSessions: result.length
                    })
                );
                return result;
            } catch {
                // Try next endpoint.
            }
        }

        return [];
    })();

    hostSessionsPromises.set(normalizedUserId, promise);
    try {
        return await promise;
    } finally {
        hostSessionsPromises.delete(normalizedUserId);
    }
}

async function fetchVisibleSessions(apiKey) {
    if (!apiKey) {
        return [];
    }

    const now = Date.now();
    if (
        Array.isArray(visibleSessionsCache.sessions) &&
        now - visibleSessionsCache.fetchedAt < 30_000
    ) {
        return visibleSessionsCache.sessions;
    }

    if (visibleSessionsPromise) {
        return visibleSessionsPromise;
    }

    visibleSessionsPromise = (async () => {
        const headers = {
            Authorization: buildResoniteAuthorizationHeader(apiKey)
        };
        const candidateUrls = [
            'https://api.resonite.com/sessions?includeEmptyHeadless=true&includeEnded=false&minActiveUsers=0',
            'https://api.resonite.com/sessions?includeEmptyHeadless=true&includeEnded=true&minActiveUsers=0'
        ];

        for (const url of candidateUrls) {
            try {
                const response = await webApiService.execute({
                    url,
                    method: 'GET',
                    headers
                });
                if (response.status !== 200 || !response.data) {
                    continue;
                }

                const payload = tryParseJson(response.data);
                const sessions = normalizeSessionsArray(payload);
                if (sessions.length === 0) {
                    continue;
                }

                visibleSessionsCache = {
                    fetchedAt: Date.now(),
                    sessions
                };

                console.debug(
                    '[ResoniteIntegration] Visible sessions lookup response:',
                    JSON.stringify({ url, totalSessions: sessions.length })
                );

                return sessions;
            } catch {
                // Try next endpoint.
            }
        }

        return [];
    })();

    try {
        return await visibleSessionsPromise;
    } finally {
        visibleSessionsPromise = null;
    }
}

async function findVisibleSessionMatch(sessions, target, hashSalt) {
    const normalizedHash = String(target?.sessionHash || '').trim();
    const normalizedBroadcastKey = String(target?.broadcastKey || '').trim();
    if (!normalizedHash && !normalizedBroadcastKey) {
        return null;
    }

    for (const session of sessions) {
        const sessionBroadcastKey = extractSessionBroadcastKey(session);
        if (
            normalizedBroadcastKey &&
            sessionBroadcastKey &&
            normalizedBroadcastKey === sessionBroadcastKey
        ) {
            return session;
        }

        const directHash = extractSessionHash(session);
        if (normalizedHash && directHash && normalizedHash === directHash) {
            return session;
        }

        if (!normalizedHash || !hashSalt) {
            continue;
        }

        const sessionId = getSessionId(session);
        if (!sessionId) {
            continue;
        }

        const hashedId = await sha256UpperHex(`${sessionId}${hashSalt}`);
        if (hashedId && hashedId === normalizedHash) {
            return session;
        }
    }

    return null;
}

function normalizeSessionsArray(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (Array.isArray(payload?.data)) {
        return payload.data;
    }

    if (Array.isArray(payload?.sessions)) {
        return payload.sessions;
    }

    if (Array.isArray(payload?.records)) {
        return payload.records;
    }

    return [];
}

async function sha256UpperHex(input) {
    if (
        typeof crypto !== 'undefined' &&
        crypto.subtle &&
        typeof TextEncoder !== 'undefined'
    ) {
        const encoded = new TextEncoder().encode(String(input || ''));
        const digest = await crypto.subtle.digest('SHA-256', encoded);
        const bytes = Array.from(new Uint8Array(digest));
        return bytes
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    }

    return '';
}

function getSessionId(session) {
    return String(
        session?.sessionId ||
            session?.id ||
            session?.sessionID ||
            session?.SessionId ||
            session?.session?.sessionId ||
            ''
    ).trim();
}

function extractSessionHash(session) {
    return String(
        session?.sessionHash ||
            session?.hash ||
            session?.session?.sessionHash ||
            session?.sessionInfo?.sessionHash ||
            ''
    ).trim();
}

function extractSessionBroadcastKey(session) {
    return String(
        session?.broadcastKey ||
            session?.session?.broadcastKey ||
            session?.sessionInfo?.broadcastKey ||
            ''
    ).trim();
}

async function resolveSessionNameByHash(sessionHash, apiKey) {
    if (!sessionHash) {
        return '';
    }

    const lastMissAt = sessionResolveMisses.get(sessionHash) || 0;
    if (lastMissAt && Date.now() - lastMissAt < 30_000) {
        return '';
    }

    if (sessionResolvePromises.has(sessionHash)) {
        return sessionResolvePromises.get(sessionHash);
    }

    const promise = (async () => {
        const headers = {
            Authorization: buildResoniteAuthorizationHeader(apiKey)
        };
        const encodedSessionHash = encodeURIComponent(sessionHash);
        const candidateUrls = [
            `https://api.resonite.com/sessions/${encodedSessionHash}`,
            `https://api.resonite.com/sessionInfos/${encodedSessionHash}`,
            `https://api.resonite.com/sessionInfo/${encodedSessionHash}`,
            `https://api.resonite.com/sessions/hash/${encodedSessionHash}`,
            `https://api.resonite.com/sessions?sessionHash=${encodedSessionHash}`,
            `https://api.resonite.com/sessionInfos?sessionHash=${encodedSessionHash}`,
            `https://api.resonite.com/sessions?hash=${encodedSessionHash}`
        ];

        for (const url of candidateUrls) {
            try {
                const response = await webApiService.execute({
                    url,
                    method: 'GET',
                    headers
                });

                if (response.status !== 200 || !response.data) {
                    console.debug(
                        '[ResoniteIntegration] Session hash lookup non-200/empty response:',
                        JSON.stringify({
                            sessionHash,
                            url,
                            status: response.status
                        })
                    );
                    continue;
                }

                const payload = tryParseJson(response.data);
                const resolution = extractSessionResolutionFromPayload(
                    payload,
                    sessionHash
                );
                const resolvedName =
                    resolution.name ||
                    extractSessionDisplayName(
                        payload?.session || payload?.data || payload
                    );
                if (resolvedName) {
                    const resolvedSession =
                        resolution.session ||
                        payload?.session ||
                        payload?.data ||
                        payload;
                    if (
                        resolvedSession &&
                        typeof resolvedSession === 'object'
                    ) {
                        setCachedSessionData(sessionHash, resolvedSession);
                    }
                    sessionNameByHash.set(sessionHash, resolvedName);
                    schedulePersistResoniteRealtimeState();
                    console.debug(
                        '[ResoniteIntegration] Session hash lookup resolved name:',
                        JSON.stringify({ sessionHash, url, resolvedName })
                    );
                    return resolvedName;
                }

                console.debug(
                    '[ResoniteIntegration] Session hash lookup returned payload without display name:',
                    JSON.stringify({
                        sessionHash,
                        url,
                        payloadType: Array.isArray(payload)
                            ? 'array'
                            : typeof payload,
                        payloadKeys:
                            payload && typeof payload === 'object'
                                ? Object.keys(payload).slice(0, 20)
                                : []
                    })
                );
            } catch (error) {
                console.debug(
                    '[ResoniteIntegration] Session hash lookup request failed:',
                    JSON.stringify({
                        sessionHash,
                        url,
                        error: String(error?.message || error || '')
                    })
                );
                // Try the next candidate endpoint.
            }
        }

        console.debug(
            '[ResoniteIntegration] Session hash lookup exhausted all endpoints without resolution:',
            JSON.stringify({ sessionHash })
        );

        sessionResolveMisses.set(sessionHash, Date.now());

        return '';
    })();

    sessionResolvePromises.set(sessionHash, promise);
    try {
        return await promise;
    } finally {
        sessionResolvePromises.delete(sessionHash);
    }
}

function tryParseJson(value) {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function extractSessionResolutionFromPayload(payload, sessionHash) {
    const root = payload?.data ?? payload;
    const normalizedHash = String(sessionHash || '').trim();

    const directName = extractSessionDisplayName(root);
    if (directName) {
        return {
            name: directName,
            session:
                root && typeof root === 'object' && !Array.isArray(root)
                    ? root
                    : null
        };
    }

    const matchedNode = findSessionNodeByHash(root, normalizedHash);
    if (matchedNode) {
        const nodeName = extractSessionDisplayName(matchedNode);
        if (nodeName) {
            return {
                name: nodeName,
                session: matchedNode
            };
        }
    }

    return {
        name: '',
        session: null
    };
}

function findSessionNodeByHash(value, sessionHash, depth = 0) {
    if (!value || depth > 5) {
        return null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findSessionNodeByHash(item, sessionHash, depth + 1);
            if (found) {
                return found;
            }
        }
        return null;
    }

    if (typeof value !== 'object') {
        return null;
    }

    const candidateHash = firstNonEmptyString(
        value.sessionHash,
        value.hash,
        value.id,
        value.session?.sessionHash,
        value.sessionInfo?.sessionHash
    );
    if (candidateHash && candidateHash === sessionHash) {
        return value.session || value.sessionInfo || value;
    }

    for (const key of Object.keys(value)) {
        const found = findSessionNodeByHash(value[key], sessionHash, depth + 1);
        if (found) {
            return found;
        }
    }

    return null;
}

function normalizeResonitePersistenceScope(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function getResoniteRealtimeCacheKey(scopeKey) {
    return `VRCX_resoniteRealtimeCache_${scopeKey}`;
}

function schedulePersistResoniteRealtimeState() {
    if (!persistenceScopeKey) {
        return;
    }

    if (persistRealtimeCacheTimer) {
        clearTimeout(persistRealtimeCacheTimer);
    }

    persistRealtimeCacheTimer = setTimeout(() => {
        persistRealtimeCacheTimer = null;
        void persistResoniteRealtimeState();
    }, 500);
}

function buildPersistedRealtimeCachePayload() {
    const sessionNames = Array.from(sessionNameByHash.entries())
        .map(([sessionHash, sessionName]) => ({
            sessionHash,
            sessionName
        }))
        .filter((entry) => entry.sessionHash && entry.sessionName)
        .slice(-RESONITE_REALTIME_CACHE_MAX_ENTRIES);

    const sessionData = Array.from(sessionDataByHash.entries())
        .map(([sessionHash, session]) => ({
            sessionHash,
            session: sanitizePersistedSessionPayload(session)
        }))
        .filter((entry) => entry.sessionHash && entry.session)
        .slice(-RESONITE_REALTIME_CACHE_MAX_ENTRIES);

    return {
        version: RESONITE_REALTIME_CACHE_VERSION,
        persistedAt: Date.now(),
        sessionNames,
        sessionData
    };
}

function sanitizePersistedSessionPayload(session) {
    if (!session || typeof session !== 'object') {
        return null;
    }

    return {
        sessionId: firstNonEmptyString(
            session.sessionId,
            session.id,
            session.sessionID,
            session.SessionId
        ),
        name: firstNonEmptyString(
            session.name,
            session.sessionName,
            session.locationName,
            session.worldName,
            session.title,
            session.friendlyName
        ),
        description: String(session.description || '').trim(),
        accessLevel: String(session.accessLevel || '').trim(),
        broadcastKey: String(session.broadcastKey || '').trim(),
        hostUserId: String(session.hostUserId || session.hostId || '').trim(),
        hostUsername: String(session.hostUsername || '').trim(),
        thumbnailUrl: firstNonEmptyString(
            session.thumbnailUrl,
            session.thumbnailURL,
            session.world?.thumbnailUrl,
            session.world?.thumbnailURL
        ),
        sessionURLs: Array.isArray(session.sessionURLs)
            ? session.sessionURLs.filter((url) => typeof url === 'string')
            : [],
        joinedUsers: Number(session.joinedUsers || 0),
        totalActiveUsers: Number(session.totalActiveUsers || 0),
        maxUsers: Number(session.maxUsers || 0),
        sessionUsers: Array.isArray(session.sessionUsers)
            ? session.sessionUsers
                  .map((user) => ({
                      userID: String(user?.userID || user?.id || '').trim(),
                      username: String(
                          user?.username || user?.displayName || ''
                      ).trim(),
                      isPresent: Boolean(user?.isPresent),
                      outputDevice: Number(user?.outputDevice || 0)
                  }))
                  .filter((user) => user.userID || user.username)
            : []
    };
}

function normalizeOutputDeviceLabel(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    const lowered = normalized.toLowerCase();
    if (
        lowered === 'unknown' ||
        lowered === 'none' ||
        lowered === 'n/a' ||
        lowered === 'null'
    ) {
        return '';
    }

    return normalized;
}
