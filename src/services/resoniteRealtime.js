import { ref } from 'vue';

import { buildResoniteAuthorizationHeader } from './resoniteAuth';
import { database } from './database';
import {
    pickResoniteAuthorityStringField,
    shouldPreferResoniteSnapshotFields,
    upsertResoniteMergeTraceField
} from './resoniteMerge';
import { createResoniteSessionCache } from './resoniteSessionCache';
import { formatResoniteWorldLabel } from '../shared/utils/resoniteWorldLabel';
import { stripResonitePrefix } from '../shared/utils/resonite';
import webApiService from './webapi';

const RESONITE_HUB_URL = 'https://api.resonite.com/hub';
const RESONITE_REALTIME_CACHE_MAX_ENTRIES = 200;
const RESONITE_REALTIME_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

export const resoniteSessionCacheVersion = ref(0);

function bumpResoniteSessionCacheVersion() {
    resoniteSessionCacheVersion.value += 1;
}

let signalRModulePromise = null;
let hubConnection = null;
let connectionApiKey = '';
let persistenceScopeKey = '';
let persistRealtimeCacheTimer = null;
let started = false;
const subscribedUserIds = new Set();
const subscribedSessionBroadcastKeys = new Set();
const presenceByUserId = new Map();
const sessionCache = createResoniteSessionCache({
    onSessionDataChanged: bumpResoniteSessionCacheVersion
});
const sessionNameByHash = sessionCache.sessionNamesByHash;
const sessionDataByHash = sessionCache.sessionDataByHash;
const sessionResolvePromises = sessionCache.resolutionPromisesByHash;
const sessionResolveMisses = sessionCache.resolutionMissesByHash;
const hostSessionsCache = sessionCache.hostSessionsByUserId;
const hostSessionsPromises = sessionCache.hostSessionPromisesByUserId;
let presenceListener = null;

function setCachedSessionData(sessionHash, sessionPayload) {
    sessionCache.setSessionData(sessionHash, sessionPayload);
}

function clearSessionCaches() {
    sessionCache.resetAll();
}

/**
 * Returns the cached full Resonite session object that was fetched when resolving
 * the given session hash. Returns null if the hash has not been resolved yet.
 * @param {string} sessionHash
 * @returns {object|null}
 */
export function getResoniteSessionByHash(sessionHash) {
    return sessionCache.getSessionData(sessionHash);
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
        sessionCache.deleteResolutionMiss(normalizedHash);
        if (normalizedUserId) {
            sessionCache.deleteHostSessions(normalizedUserId);
        }
        sessionCache.resetVisibleSessions();
    }

    if (!normalizedApiKey) {
        return getResoniteSessionByHash(normalizedHash);
    }

    await resolveSessionNameByHash(normalizedHash, normalizedApiKey);
    let resolvedSession = getResoniteSessionByHash(normalizedHash);
    if (resolvedSession) {
        return resolvedSession;
    }

    if (normalizedUserId) {
        resolvedSession = await refreshSessionFromHostSessions(
            normalizedHash,
            normalizedUserId,
            normalizedApiKey
        );
        if (resolvedSession) {
            return resolvedSession;
        }
    }

    return getResoniteSessionByHash(normalizedHash);
}

export async function hydratePersistedResoniteRealtimeState(scopeKey) {
    persistenceScopeKey = normalizeResonitePersistenceScope(scopeKey);
    if (!persistenceScopeKey) {
        return false;
    }

    try {
        const hydratedFromDatabase =
            await hydratePersistedResoniteRealtimeStateFromDatabase();
        return hydratedFromDatabase.presence || hydratedFromDatabase.sessions;
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
        const persistedAt = Date.now();
        await database.replaceResoniteCachedPresence(
            buildPersistedRealtimePresenceRows(persistedAt)
        );
        await database.replaceResoniteCachedSessions(
            buildPersistedRealtimeSessionRows(persistedAt)
        );
        await database.setResoniteSyncState({
            scope: normalizedScopeKey,
            lastAttemptAt: persistedAt,
            lastSuccessfulPresenceAt: persistedAt
        });
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
        await database.clearResoniteCachedPresence();
        await database.clearResoniteCachedSessions();
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

export function reconcileResoniteRealtimeAgainstSnapshot(resoniteFriendsList) {
    if (
        !Array.isArray(resoniteFriendsList) ||
        resoniteFriendsList.length === 0
    ) {
        return 0;
    }

    let prunedCount = 0;

    for (const friendData of resoniteFriendsList) {
        const userId = normalizeResoniteUserId(
            stripResonitePrefix(friendData?.id)
        );
        if (!userId) {
            continue;
        }

        const snapshotHasPresenceSignals =
            friendData?.resonite?.hasPresenceSignals !== false &&
            friendData?.ref?.resonite?.hasPresenceSignals !== false;
        if (!snapshotHasPresenceSignals) {
            continue;
        }

        const snapshotState = String(friendData?.state || '')
            .trim()
            .toLowerCase();
        if (snapshotState !== 'offline') {
            continue;
        }

        const contactObservedAt = Number(
            friendData?.resonite?.contactObservedAt ||
                friendData?.ref?.resonite?.contactObservedAt ||
                0
        );
        if (!Number.isFinite(contactObservedAt) || contactObservedAt <= 0) {
            continue;
        }

        const existingPresence = presenceByUserId.get(userId);
        if (!existingPresence) {
            continue;
        }

        const realtimeObservedAt = Number(existingPresence?.updatedAt || 0);
        if (
            !Number.isFinite(realtimeObservedAt) ||
            realtimeObservedAt <= 0 ||
            realtimeObservedAt >= contactObservedAt
        ) {
            continue;
        }

        presenceByUserId.delete(userId);
        prunedCount += 1;

        console.debug(
            '[ResoniteIntegration] Pruned stale realtime presence after newer snapshot:',
            JSON.stringify({
                userId,
                snapshotState,
                contactObservedAt,
                realtimeObservedAt,
                sourceEvent: String(existingPresence?.sourceEvent || '').trim()
            })
        );
    }

    if (prunedCount > 0) {
        schedulePersistResoniteRealtimeState();
    }

    return prunedCount;
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
        let mergeTrace = {
            ...(friendData?.resonite?.mergeTrace || {}),
            ...(friendData?.ref?.resonite?.mergeTrace || {})
        };

        function recordRealtimeMergeTrace(
            field,
            winner,
            reason,
            existingValue,
            incomingValue,
            selectedValue
        ) {
            mergeTrace = upsertResoniteMergeTraceField(
                mergeTrace,
                'realtime',
                field,
                {
                    winner,
                    reason,
                    sourceEvent: String(
                        realtimePresence?.sourceEvent || ''
                    ).trim(),
                    existingValue,
                    incomingValue,
                    selectedValue
                }
            );
        }

        function selectRealtimeAuthorityStringField({
            field,
            preferSnapshot,
            snapshotValues = [],
            realtimeValues = [],
            trailingValues = [],
            snapshotReason,
            realtimeReason
        }) {
            const snapshotValue = firstNonEmptyString(...snapshotValues);
            const realtimeValue = firstNonEmptyString(...realtimeValues);
            const trailingValue = firstNonEmptyString(...trailingValues);
            const selectedValue = pickResoniteAuthorityStringField({
                preferPrimary: preferSnapshot,
                primaryValues: snapshotValues,
                secondaryValues: realtimeValues,
                trailingValues
            });

            if (
                preferSnapshot &&
                snapshotValue &&
                selectedValue === snapshotValue
            ) {
                recordRealtimeMergeTrace(
                    field,
                    'snapshot',
                    snapshotReason,
                    snapshotValue,
                    realtimeValue,
                    selectedValue
                );
                return selectedValue;
            }

            if (realtimeValue && selectedValue === realtimeValue) {
                recordRealtimeMergeTrace(
                    field,
                    'realtime',
                    realtimeReason,
                    snapshotValue,
                    realtimeValue,
                    selectedValue
                );
                return selectedValue;
            }

            const fallbackWinner = snapshotValue
                ? 'snapshot'
                : realtimeValue
                  ? 'realtime'
                  : 'derived';
            recordRealtimeMergeTrace(
                field,
                fallbackWinner,
                trailingValue ? 'derived-fallback' : 'no-realtime-value',
                snapshotValue,
                realtimeValue,
                selectedValue
            );
            return selectedValue;
        }

        const preferSnapshotSessionFields = shouldPreferSnapshotSessionFields(
            friendData,
            realtimePresence
        );

        const preferredCurrentSessionHash = selectRealtimeAuthorityStringField({
            field: 'currentSessionHash',
            preferSnapshot: preferSnapshotSessionFields,
            snapshotValues: [
                friendData?.resonite?.realtime?.currentSessionHash,
                friendData?.resonite?.currentSessionHash
            ],
            realtimeValues: [realtimePresence.currentSessionHash],
            snapshotReason: 'snapshot-session-authoritative',
            realtimeReason: 'realtime-session-authoritative'
        });

        const preferredCurrentSessionName = selectRealtimeAuthorityStringField({
            field: 'currentSessionName',
            preferSnapshot: preferSnapshotSessionFields,
            snapshotValues: [
                friendData?.resonite?.realtime?.currentSessionName,
                friendData?.resonite?.currentSessionName
            ],
            realtimeValues: [
                realtimePresence.currentSessionName,
                realtimePresence.locationName,
                getCachedSessionName(preferredCurrentSessionHash)
            ],
            trailingValues: preferSnapshotSessionFields
                ? [getCachedSessionName(preferredCurrentSessionHash)]
                : [],
            snapshotReason: 'snapshot-session-authoritative',
            realtimeReason: 'realtime-session-authoritative'
        });

        const preferredLocationName = preferSnapshotSessionFields
            ? firstNonEmptyString(
                  friendData?.resonite?.locationName,
                  friendData?.resonite?.realtime?.currentSessionName,
                  friendData?.resonite?.currentSessionName,
                  friendData?.ref?.traveling,
                  sanitizeResoniteLocationFallback(
                      friendData?.ref?.location,
                      isOnline
                  ),
                  preferredCurrentSessionName,
                  realtimePresence.locationName
              )
            : firstNonEmptyString(
                  preferredCurrentSessionName,
                  realtimePresence.locationName,
                  friendData?.resonite?.locationName,
                  friendData?.ref?.traveling,
                  sanitizeResoniteLocationFallback(
                      friendData?.ref?.location,
                      isOnline
                  )
              );

        const fallbackCurrentSession = getCurrentSessionFromList(
            Array.isArray(realtimePresence.sessions)
                ? realtimePresence.sessions
                : [],
            Number(firstDefined(realtimePresence.currentSessionIndex, -1))
        );
        const resolvedCurrentSession = preferredCurrentSessionHash
            ? getResoniteSessionByHash(preferredCurrentSessionHash)
            : null;
        const effectiveCurrentSession =
            resolvedCurrentSession || fallbackCurrentSession;
        const privateSessionLabel = getPrivateSessionLabel(
            effectiveCurrentSession
        );
        const sessionId = firstNonEmptyString(
            getSessionId(effectiveCurrentSession),
            friendData?.resonite?.sessionId,
            friendData?.resonite?.realtime?.sessionId,
            friendData?.ref?.resonite?.sessionId,
            friendData?.ref?.resonite?.realtime?.sessionId
        );
        const broadcastKey = firstNonEmptyString(
            extractSessionBroadcastKey(effectiveCurrentSession),
            friendData?.resonite?.broadcastKey,
            friendData?.resonite?.realtime?.broadcastKey,
            friendData?.ref?.resonite?.broadcastKey,
            friendData?.ref?.resonite?.realtime?.broadcastKey
        );

        const locationName = isOnline
            ? firstNonEmptyString(privateSessionLabel, preferredLocationName)
            : '';
        const preferSnapshotStatusDescription =
            shouldPreferResoniteSnapshotFields(
                realtimePresence?.sourceEvent,
                friendData?.ref?.statusDescription,
                friendData?.resonite?.profile?.tagline,
                friendData?.resonite?.profile?.description
            );
        const statusDescription = isOnline
            ? selectRealtimeAuthorityStringField({
                  field: 'statusDescription',
                  preferSnapshot: preferSnapshotStatusDescription,
                  snapshotValues: [
                      friendData?.ref?.statusDescription,
                      friendData?.resonite?.profile?.tagline,
                      friendData?.resonite?.profile?.description
                  ],
                  realtimeValues: [realtimePresence.statusDescription],
                  snapshotReason: 'snapshot-status-authoritative',
                  realtimeReason: 'realtime-status-authoritative'
              })
            : firstNonEmptyString(realtimePresence.statusDescription);

        const appVersion = selectRealtimeAuthorityStringField({
            field: 'appVersion',
            preferSnapshot: shouldPreferResoniteSnapshotFields(
                realtimePresence?.sourceEvent,
                friendData?.resonite?.appVersion
            ),
            snapshotValues: [friendData?.resonite?.appVersion],
            realtimeValues: [realtimePresence.appVersion],
            snapshotReason: 'snapshot-status-authoritative',
            realtimeReason: 'realtime-status-authoritative'
        });
        const outputDevice = selectRealtimeAuthorityStringField({
            field: 'outputDevice',
            preferSnapshot: shouldPreferResoniteSnapshotFields(
                realtimePresence?.sourceEvent,
                friendData?.resonite?.outputDevice
            ),
            snapshotValues: [friendData?.resonite?.outputDevice],
            realtimeValues: [realtimePresence.outputDevice],
            snapshotReason: 'snapshot-status-authoritative',
            realtimeReason: 'realtime-status-authoritative'
        });
        const sessionType = selectRealtimeAuthorityStringField({
            field: 'sessionType',
            preferSnapshot: shouldPreferResoniteSnapshotFields(
                realtimePresence?.sourceEvent,
                friendData?.resonite?.sessionType
            ),
            snapshotValues: [friendData?.resonite?.sessionType],
            realtimeValues: [realtimePresence.sessionType],
            snapshotReason: 'snapshot-status-authoritative',
            realtimeReason: 'realtime-status-authoritative'
        });
        const currentSessionName = isOnline
            ? firstNonEmptyString(
                  privateSessionLabel,
                  preferredCurrentSessionName
              )
            : '';
        const currentSessionHash = isOnline ? preferredCurrentSessionHash : '';
        const accessLevel = isOnline
            ? firstNonEmptyString(
                  getResoniteSessionByHash(currentSessionHash)?.accessLevel,
                  friendData?.resonite?.accessLevel,
                  friendData?.resonite?.realtime?.accessLevel,
                  friendData?.ref?.resonite?.accessLevel
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
            sessionId,
            broadcastKey,
            accessLevel,
            updatedAt: Number(firstDefined(realtimePresence.updatedAt, 0)),
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
                    sessionId,
                    broadcastKey,
                    accessLevel,
                    isPresent: realtimeSnapshot.isPresent,
                    userSessionId: realtimeSnapshot.userSessionId,
                    compatibilityHash: realtimeSnapshot.compatibilityHash,
                    mergeTrace,
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
                sessionId,
                broadcastKey,
                accessLevel,
                isPresent: realtimeSnapshot.isPresent,
                userSessionId: realtimeSnapshot.userSessionId,
                compatibilityHash: realtimeSnapshot.compatibilityHash,
                mergeTrace,
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
    sessionCache.resetAll();

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

        const currentSession = getCurrentSessionMetadata(existingPresence);
        const currentBroadcastKey = String(
            currentSession?.broadcastKey || ''
        ).trim();
        if (currentBroadcastKey && currentBroadcastKey !== broadcastKey) {
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
        const currentSessionHash = String(
            currentSession?.sessionHash || ''
        ).trim();
        const preferredHash = sessionHashes.includes(currentSessionHash)
            ? currentSessionHash
            : sessionHashes.includes(existingHash)
              ? existingHash
              : currentBroadcastKey
                ? ''
                : sessionHashes[0];

        if (!preferredHash) {
            continue;
        }

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
    const explicitStatus = firstDefined(
        eventObject.onlineStatus,
        eventObject.status,
        eventObject.userStatus?.onlineStatus,
        eventObject.entity?.onlineStatus,
        eventObject.entity?.status
    );
    const hasLocationData = hasExplicitPresenceLocationData(eventObject);
    const normalizedStatus =
        normalizeStatus(explicitStatus) ||
        (!hasLocationData
            ? normalizeStatus(previousPresence?.onlineStatus)
            : '') ||
        'offline';

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
    const explicitCurrentSessionHash = firstNonEmptyString(
        eventObject.currentSession?.sessionHash,
        eventObject.session?.sessionHash,
        currentSession?.sessionHash
    );
    const previousCurrentSessionHash = firstNonEmptyString(
        previousPresence?.currentSessionHash
    );
    const canPreservePreviousSessionIdentity =
        !explicitCurrentSessionHash ||
        !previousCurrentSessionHash ||
        explicitCurrentSessionHash === previousCurrentSessionHash;
    const preservePreviousSessionIdentity =
        !hasLocationData &&
        ['online', 'busy', 'away', 'sociable'].includes(normalizedStatus) &&
        canPreservePreviousSessionIdentity;
    const reusePreviousSessionDisplayFields =
        canPreservePreviousSessionIdentity &&
        (hasLocationData || preservePreviousSessionIdentity);
    const sessionPrivacyLabel = getPrivateSessionLabel(currentSession);
    const currentSessionName = firstNonEmptyString(
        sessionPrivacyLabel,
        extractSessionDisplayName(eventObject.currentSession),
        extractSessionDisplayName(eventObject.session),
        extractSessionDisplayName(currentSession),
        reusePreviousSessionDisplayFields
            ? previousPresence?.currentSessionName
            : ''
    );
    const currentSessionHash = firstNonEmptyString(
        eventObject.currentSession?.sessionHash,
        eventObject.session?.sessionHash,
        currentSession?.sessionHash,
        preservePreviousSessionIdentity || hasLocationData
            ? previousPresence?.currentSessionHash
            : ''
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
            reusePreviousSessionDisplayFields
                ? previousPresence?.locationName
                : ''
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

function hasExplicitSnapshotSessionFields(friendData) {
    return Boolean(
        firstNonEmptyString(
            friendData?.resonite?.currentSessionHash,
            friendData?.resonite?.currentSessionName,
            friendData?.resonite?.locationName,
            friendData?.resonite?.realtime?.currentSessionHash,
            friendData?.resonite?.realtime?.currentSessionName,
            friendData?.ref?.traveling,
            sanitizeResoniteLocationFallback(friendData?.ref?.location, true)
        )
    );
}

function shouldPreferSnapshotSessionFields(friendData, realtimePresence) {
    if (
        !shouldPreferResoniteSnapshotFields(
            realtimePresence?.sourceEvent,
            friendData?.resonite?.currentSessionHash,
            friendData?.resonite?.currentSessionName,
            friendData?.resonite?.locationName,
            friendData?.resonite?.realtime?.currentSessionHash,
            friendData?.resonite?.realtime?.currentSessionName,
            friendData?.ref?.traveling,
            sanitizeResoniteLocationFallback(friendData?.ref?.location, true)
        )
    ) {
        return false;
    }

    return !firstNonEmptyString(realtimePresence?.currentSessionHash);
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

function isSyntheticPrivateSessionLabel(value) {
    return (
        String(value || '')
            .trim()
            .toLowerCase() === 'private'
    );
}

function getCachedSessionName(sessionHash) {
    return sessionCache.getSessionName(sessionHash);
}

function cacheResolvedSession(sessionHash, session) {
    const normalizedHash = String(sessionHash || '').trim();
    if (!normalizedHash || !session || typeof session !== 'object') {
        return null;
    }

    const resolvedName = extractSessionDisplayName(session);
    if (resolvedName) {
        sessionNameByHash.set(normalizedHash, resolvedName);
    }
    setCachedSessionData(normalizedHash, session);
    schedulePersistResoniteRealtimeState();
    return getResoniteSessionByHash(normalizedHash);
}

async function refreshSessionFromHostSessions(sessionHash, userId, apiKey) {
    const sessions = await fetchHostSessions(userId, apiKey);
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return null;
    }

    const matchingSession = sessions.find((session) => {
        const directHash = extractSessionHash(session);
        return directHash && directHash === sessionHash;
    });

    return matchingSession
        ? cacheResolvedSession(sessionHash, matchingSession)
        : null;
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
    const resolvedSession = preferredHash
        ? getResoniteSessionByHash(preferredHash)
        : null;
    const resolvedAccessLevel = firstNonEmptyString(
        resolvedSession?.accessLevel,
        existing.accessLevel
    );
    const formattedResolvedName = formatResoniteWorldLabel(
        resolvedName,
        resolvedAccessLevel
    );

    const hasSyntheticPrivateLabel =
        isSyntheticPrivateSessionLabel(existing.locationName) ||
        isSyntheticPrivateSessionLabel(existing.currentSessionName);
    const allowResolvedNamePromotion =
        hasSyntheticPrivateLabel ||
        !firstNonEmptyString(
            existing.locationName,
            existing.currentSessionName,
            existing.statusDescription
        );
    const updatedPresence = {
        ...existing,
        sourceEvent: allowResolvedNamePromotion
            ? 'ResolvedSessionName'
            : existing.sourceEvent,
        accessLevel: resolvedAccessLevel,
        locationName: hasSyntheticPrivateLabel
            ? formattedResolvedName
            : firstNonEmptyString(existing.locationName, resolvedName),
        currentSessionName: hasSyntheticPrivateLabel
            ? firstNonEmptyString(
                  formattedResolvedName,
                  existing.currentSessionName
              )
            : firstNonEmptyString(
                  existing.currentSessionName,
                  existing.locationName,
                  resolvedName
              )
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
                    currentSessionName: formattedResolvedName,
                    accessLevel: resolvedAccessLevel
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
        const directHash = extractSessionHash(session);
        if (directHash && unresolvedSet.has(directHash)) {
            const resolvedSession = cacheResolvedSession(directHash, session);
            if (!resolvedSession) {
                continue;
            }

            unresolvedSet.delete(directHash);
            resolvedAny = true;
            console.debug(
                '[ResoniteIntegration] Resolved session hash via host sessions direct match:',
                JSON.stringify({
                    userId,
                    sessionHash: directHash,
                    resolvedName: extractSessionDisplayName(resolvedSession)
                })
            );
            continue;
        }

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

        cacheResolvedSession(hashedId, session);
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

        cacheResolvedSession(target.sessionHash, matchingSession);
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
                    return hostId && hostId === normalizedUserId;
                });

                console.debug(
                    '[ResoniteIntegration] Host sessions lookup response:',
                    JSON.stringify({
                        userId: normalizedUserId,
                        url,
                        totalSessions: sessions.length,
                        filteredSessions: filtered.length
                    })
                );

                if (filtered.length === 0) {
                    continue;
                }

                hostSessionsCache.set(normalizedUserId, {
                    fetchedAt: Date.now(),
                    sessions: filtered
                });
                return filtered;
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
        Array.isArray(sessionCache.visibleSessions.sessions) &&
        now - sessionCache.visibleSessions.fetchedAt < 30_000
    ) {
        return sessionCache.visibleSessions.sessions;
    }

    if (sessionCache.visibleSessionsPromise) {
        return sessionCache.visibleSessionsPromise;
    }

    sessionCache.visibleSessionsPromise = (async () => {
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

                sessionCache.visibleSessions = {
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
        return await sessionCache.visibleSessionsPromise;
    } finally {
        sessionCache.visibleSessionsPromise = null;
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
            `https://api.resonite.com/sessions/${encodedSessionHash}`
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

    const directSessionNode = extractDirectSessionNode(root);
    if (directSessionNode) {
        const directSessionName = firstNonEmptyString(
            extractSessionDisplayName(directSessionNode),
            extractSessionDisplayName(root)
        );
        if (directSessionName) {
            return {
                name: directSessionName,
                session: directSessionNode
            };
        }
    }

    const matchedNode = findSessionNodeByHash(root, normalizedHash);
    if (matchedNode) {
        const nodeName = firstNonEmptyString(
            extractSessionDisplayName(matchedNode),
            extractSessionDisplayName(root)
        );
        if (nodeName) {
            return {
                name: nodeName,
                session: matchedNode
            };
        }
    }

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

    return {
        name: '',
        session: null
    };
}

function extractDirectSessionNode(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    if (value.session && typeof value.session === 'object') {
        return value.session;
    }

    if (value.sessionInfo && typeof value.sessionInfo === 'object') {
        return value.sessionInfo;
    }

    return null;
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

async function hydratePersistedResoniteRealtimeStateFromDatabase() {
    const now = Date.now();
    const cachedPresence = await database.getResoniteCachedPresence();
    const cachedSessions = await database.getResoniteCachedSessions();

    const hydratedPresence = hydratePersistedRealtimePresenceRows(
        cachedPresence,
        now
    );
    const hydratedSessions = hydratePersistedRealtimeSessionRows(
        cachedSessions,
        now
    );

    return {
        presence: hydratedPresence,
        sessions: hydratedSessions
    };
}

function hydratePersistedRealtimePresenceRows(cachedPresence, now) {
    if (!Array.isArray(cachedPresence) || cachedPresence.length === 0) {
        return false;
    }

    presenceByUserId.clear();

    for (const entry of cachedPresence) {
        const userId = normalizeResoniteUserId(entry?.resoniteUserId);
        const expiresAt = Number(entry?.expiresAt || 0);
        const observedAt = Number(entry?.observedAt || 0);
        const isExpired =
            (expiresAt > 0 && expiresAt <= now) ||
            (!expiresAt &&
                (!observedAt ||
                    now - observedAt > RESONITE_REALTIME_CACHE_MAX_AGE_MS));
        if (!userId || isExpired) {
            continue;
        }

        const payload =
            entry?.payload && typeof entry.payload === 'object'
                ? entry.payload
                : null;
        const persistedPresence = buildHydratedPersistedPresence(
            userId,
            entry,
            payload
        );
        presenceByUserId.set(userId, persistedPresence);
    }

    return presenceByUserId.size > 0;
}

function hydratePersistedRealtimeSessionRows(cachedSessions, now) {
    if (!Array.isArray(cachedSessions) || cachedSessions.length === 0) {
        return false;
    }

    sessionCache.clearResolvedSessions({ notify: false });

    for (const entry of cachedSessions) {
        const sessionHash = String(entry?.sessionHash || '').trim();
        const expiresAt = Number(entry?.expiresAt || 0);
        const observedAt = Number(entry?.observedAt || 0);
        const isExpired =
            (expiresAt > 0 && expiresAt <= now) ||
            (!expiresAt &&
                (!observedAt ||
                    now - observedAt > RESONITE_REALTIME_CACHE_MAX_AGE_MS));
        if (!sessionHash || isExpired) {
            continue;
        }

        const sessionName = String(entry?.sessionName || '').trim();
        const sessionPayload =
            entry?.payload && typeof entry.payload === 'object'
                ? entry.payload
                : null;

        if (sessionName) {
            sessionNameByHash.set(sessionHash, sessionName);
        }

        if (sessionPayload && Object.keys(sessionPayload).length > 0) {
            sessionDataByHash.set(sessionHash, sessionPayload);
        }
    }

    if (sessionNameByHash.size === 0 && sessionDataByHash.size === 0) {
        return false;
    }

    bumpResoniteSessionCacheVersion();
    return true;
}

function buildPersistedRealtimeSessionRows(persistedAt = Date.now()) {
    const expiresAt = persistedAt + RESONITE_REALTIME_CACHE_MAX_AGE_MS;
    const sessionRowsByHash = new Map();

    for (const [sessionHash, sessionName] of sessionNameByHash.entries()) {
        const normalizedHash = String(sessionHash || '').trim();
        const normalizedName = String(sessionName || '').trim();
        if (!normalizedHash || !normalizedName) {
            continue;
        }

        sessionRowsByHash.set(normalizedHash, {
            sessionHash: normalizedHash,
            sessionName: normalizedName,
            hostUserId: '',
            observedAt: persistedAt,
            expiresAt,
            payload: {}
        });
    }

    for (const [sessionHash, session] of sessionDataByHash.entries()) {
        const normalizedHash = String(sessionHash || '').trim();
        const sanitizedSession = sanitizePersistedSessionPayload(session);
        if (!normalizedHash || !sanitizedSession) {
            continue;
        }

        const currentEntry = sessionRowsByHash.get(normalizedHash) || {
            sessionHash: normalizedHash,
            sessionName: '',
            hostUserId: '',
            observedAt: persistedAt,
            expiresAt,
            payload: {}
        };

        sessionRowsByHash.set(normalizedHash, {
            ...currentEntry,
            sessionName: firstNonEmptyString(
                currentEntry.sessionName,
                sanitizedSession.name
            ),
            hostUserId: firstNonEmptyString(
                currentEntry.hostUserId,
                sanitizedSession.hostUserId,
                sanitizedSession.hostUserID
            ),
            observedAt: persistedAt,
            expiresAt,
            payload: sanitizedSession
        });
    }

    return Array.from(sessionRowsByHash.values())
        .filter((entry) => entry.sessionHash)
        .slice(-RESONITE_REALTIME_CACHE_MAX_ENTRIES);
}

function buildPersistedRealtimePresenceRows(persistedAt = Date.now()) {
    const expiresAt = persistedAt + RESONITE_REALTIME_CACHE_MAX_AGE_MS;

    return Array.from(presenceByUserId.entries())
        .map(([userId, presence]) => {
            const normalizedUserId = normalizeResoniteUserId(userId);
            const sanitizedPresence = sanitizePersistedPresencePayload(
                normalizedUserId,
                presence,
                persistedAt
            );
            if (!normalizedUserId || !sanitizedPresence) {
                return null;
            }

            return {
                resoniteUserId: normalizedUserId,
                onlineStatus: String(
                    sanitizedPresence.onlineStatus || ''
                ).trim(),
                locationName: String(
                    sanitizedPresence.locationName || ''
                ).trim(),
                currentSessionHash: String(
                    sanitizedPresence.currentSessionHash || ''
                ).trim(),
                currentSessionName: String(
                    sanitizedPresence.currentSessionName || ''
                ).trim(),
                userSessionId: String(
                    sanitizedPresence.userSessionId || ''
                ).trim(),
                sessionType: String(sanitizedPresence.sessionType || '').trim(),
                outputDevice: String(
                    sanitizedPresence.outputDevice || ''
                ).trim(),
                appVersion: String(sanitizedPresence.appVersion || '').trim(),
                compatibilityHash: String(
                    sanitizedPresence.compatibilityHash || ''
                ).trim(),
                isMobile: sanitizedPresence.isMobile,
                isPresent: sanitizedPresence.isPresent,
                observedAt: Number(sanitizedPresence.updatedAt || persistedAt),
                expiresAt,
                source: String(sanitizedPresence.sourceEvent || '').trim(),
                payload: sanitizedPresence
            };
        })
        .filter(Boolean)
        .slice(-RESONITE_REALTIME_CACHE_MAX_ENTRIES);
}

function sanitizePersistedPresencePayload(
    userId,
    presence,
    persistedAt = Date.now()
) {
    if (!presence || typeof presence !== 'object') {
        return null;
    }

    return {
        userId: normalizeResoniteUserId(
            firstNonEmptyString(presence.userId, userId)
        ),
        onlineStatus: normalizeStatus(presence.onlineStatus) || 'offline',
        statusDescription: firstNonEmptyString(presence.statusDescription),
        locationName: firstNonEmptyString(presence.locationName),
        appVersion: firstNonEmptyString(presence.appVersion),
        outputDevice: firstNonEmptyString(presence.outputDevice),
        sessionType: firstNonEmptyString(presence.sessionType),
        userSessionId: firstNonEmptyString(presence.userSessionId),
        compatibilityHash: firstNonEmptyString(presence.compatibilityHash),
        hashSalt: firstNonEmptyString(presence.hashSalt),
        isPresent: Boolean(firstDefined(presence.isPresent, false)),
        isMobile:
            presence.isMobile === undefined ? null : Boolean(presence.isMobile),
        currentSessionIndex: Number(
            firstDefined(presence.currentSessionIndex, -1)
        ),
        currentSessionName: firstNonEmptyString(presence.currentSessionName),
        currentSessionHash: firstNonEmptyString(presence.currentSessionHash),
        lastPresenceTimestamp: firstNonEmptyString(
            presence.lastPresenceTimestamp
        ),
        lastStatusChange: firstNonEmptyString(presence.lastStatusChange),
        sessions: Array.isArray(presence.sessions) ? presence.sessions : [],
        updatedAt: Number(firstDefined(presence.updatedAt, persistedAt)),
        sourceEvent: firstNonEmptyString(presence.sourceEvent)
    };
}

function buildHydratedPersistedPresence(userId, entry, payload) {
    const fallbackPayload = {
        userId,
        onlineStatus: normalizeStatus(entry?.onlineStatus) || 'offline',
        locationName: firstNonEmptyString(entry?.locationName),
        appVersion: firstNonEmptyString(entry?.appVersion),
        outputDevice: firstNonEmptyString(entry?.outputDevice),
        sessionType: firstNonEmptyString(entry?.sessionType),
        userSessionId: firstNonEmptyString(entry?.userSessionId),
        compatibilityHash: firstNonEmptyString(entry?.compatibilityHash),
        isPresent: Boolean(firstDefined(entry?.isPresent, false)),
        currentSessionIndex: -1,
        currentSessionName: firstNonEmptyString(entry?.currentSessionName),
        currentSessionHash: firstNonEmptyString(entry?.currentSessionHash),
        sessions: [],
        updatedAt: Number(entry?.observedAt || Date.now()),
        sourceEvent: firstNonEmptyString(entry?.source)
    };

    return sanitizePersistedPresencePayload(userId, {
        ...fallbackPayload,
        ...(payload || {})
    });
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
