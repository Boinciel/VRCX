import webApiService from './webapi';
import { database } from './database';
import { useAdvancedSettingsStore } from '../stores';
import {
    buildResoniteAuthorizationHeader,
    ensureResoniteSessionIsFresh
} from './resoniteAuth';
import { upsertResoniteMergeTraceField } from './resoniteMerge';
import { convertFileUrlToImageUrl } from '../shared/utils/common';

const RESONITE_USER_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const resoniteUserProfileCache = new Map();

export {
    buildResoniteAuthorizationHeader,
    createResoniteSession
} from './resoniteAuth';

export { RESONITE_USER_PROFILE_CACHE_TTL_MS };

/**
 * @returns {Promise<{success: boolean, friends: Object[]}>}
 */
export async function fetchResoniteFriends() {
    const advancedSettingsStore = useAdvancedSettingsStore();

    const endpoint = advancedSettingsStore.resoniteFriendsEndpoint;

    if (!endpoint) {
        console.warn(
            '[ResoniteIntegration] Endpoint not configured, skipping fetch'
        );
        return {
            success: false,
            friends: []
        };
    }

    try {
        await ensureResoniteSessionIsFresh();
        const apiKey = advancedSettingsStore.resoniteApiKey;
        const headers = {};

        if (apiKey) {
            headers['Authorization'] = buildResoniteAuthorizationHeader(apiKey);
        }

        const response = await webApiService.execute({
            url: endpoint,
            method: 'GET',
            headers
        });

        if (response.status !== 200) {
            console.warn(
                `[ResoniteIntegration] Fetch failed with status ${response.status}: ${response.data}`
            );
            return {
                success: false,
                friends: []
            };
        }

        let payload;
        try {
            payload = JSON.parse(response.data);
        } catch (e) {
            console.error(
                '[ResoniteIntegration] Failed to parse endpoint response as JSON',
                e
            );
            return {
                success: false,
                friends: []
            };
        }

        console.debug(
            '[ResoniteIntegration] Raw payload from endpoint:',
            JSON.stringify(payload, null, 2)
        );

        const normalized = normalizeResoniteFriends(payload);
        const enriched = await enrichResoniteFriendsWithUserProfiles(
            normalized,
            {
                apiBaseUrl: getResoniteApiBaseUrl(endpoint),
                headers
            }
        );
        console.debug(
            `[ResoniteIntegration] Normalized ${enriched.length} friends:`,
            JSON.stringify(enriched, null, 2)
        );
        return {
            success: true,
            friends: enriched
        };
    } catch (error) {
        console.error('[ResoniteIntegration] Error fetching friends:', error);
        return {
            success: false,
            friends: []
        };
    }
}

/**
 * @param {any} payload
 * @returns {Object[]}
 */
export function normalizeResoniteFriends(payload) {
    if (!payload) {
        console.warn('[ResoniteIntegration] Payload is null or undefined');
        return [];
    }

    let friendsArray = null;

    if (Array.isArray(payload)) {
        friendsArray = payload;
    } else if (typeof payload === 'object' && Array.isArray(payload.friends)) {
        friendsArray = payload.friends;
    } else if (typeof payload === 'object' && Array.isArray(payload.contacts)) {
        friendsArray = payload.contacts;
    } else if (
        typeof payload === 'object' &&
        Array.isArray(payload?.entity?.friends)
    ) {
        friendsArray = payload.entity.friends;
    } else if (
        typeof payload === 'object' &&
        Array.isArray(payload?.entity?.contacts)
    ) {
        friendsArray = payload.entity.contacts;
    }

    if (!friendsArray) {
        console.warn(
            '[ResoniteIntegration] Payload does not contain friends array at root or .friends'
        );
        return [];
    }

    const normalized = [];
    const contactObservedAt = Date.now();
    let presenceSignalsCount = 0;
    let contactsLikeCount = 0;

    for (const entry of friendsArray) {
        try {
            if (hasPresenceSignals(entry)) {
                presenceSignalsCount += 1;
            }
            if (isContactsLikeEntry(entry)) {
                contactsLikeCount += 1;
            }
            const normalizedEntry = normalizeResoniteFriend(entry, {
                contactObservedAt
            });
            if (normalizedEntry) {
                normalized.push(normalizedEntry);
            }
        } catch (error) {
            console.error(
                '[ResoniteIntegration] Error normalizing friend entry:',
                error,
                entry
            );
        }
    }

    if (normalized.length > 0 && presenceSignalsCount === 0) {
        console.warn(
            `[ResoniteIntegration] Payload appears to be contacts-only (normalized=${normalized.length}, contactsLike=${contactsLikeCount}) with no presence/status/session fields. Entries will default to offline. Configure an endpoint/data source that includes presence details (e.g. onlineStatus/userStatus/currentSession).`
        );
    }

    return normalized;
}

/**
 * @param {Object} entry
 * @returns {Object|null}
 */
export function normalizeResoniteFriend(entry, options = {}) {
    if (!entry || typeof entry !== 'object') {
        console.warn('[ResoniteIntegration] Entry is not an object:', entry);
        return null;
    }

    const payload = firstObject(entry.entity, entry);
    const userStatus = firstObject(entry.userStatus, payload?.userStatus);
    const profile = firstObject(entry.profile, payload?.profile);
    const currentSession = firstObject(
        entry.currentSession,
        payload?.currentSession,
        userStatus?.currentSession
    );
    const sessions = firstArray(
        entry.sessions,
        payload?.sessions,
        userStatus?.sessions,
        userStatus?.decodedSessions
    );
    const primarySessionMetadata = firstObject(
        sessions[0],
        entry.session,
        payload?.session,
        userStatus?.session
    );

    const id = firstNonEmptyString(
        entry.id,
        entry.userId,
        entry.contactUserId,
        entry.contact?.id,
        entry.user?.id,
        userStatus?.userId,
        entry.entity?.id,
        entry.entity?.userId,
        payload?.id,
        payload?.userId,
        payload?.contactUserId,
        payload?.contact?.id
    );

    const rawDisplayName = firstNonEmptyString(
        entry.displayName,
        entry.username,
        entry.name,
        entry.contactDisplayName,
        entry.contactUsername,
        entry.contact?.displayName,
        entry.contact?.username,
        entry.contact?.name,
        entry.user?.displayName,
        entry.user?.username,
        entry.user?.name,
        entry.entity?.displayName,
        entry.entity?.username,
        entry.entity?.name,
        entry.entity?.contactUsername,
        entry.entity?.contactDisplayName,
        payload?.displayName,
        payload?.username,
        payload?.name,
        payload?.contactDisplayName,
        payload?.contactUsername,
        payload?.contact?.displayName,
        payload?.contact?.username,
        payload?.contact?.name,
        profile?.displayName,
        profile?.username,
        profile?.name
    );

    const explicitPresenceSignals = hasPresenceSignals(entry);
    const normalizedStatus = normalizeStatus(
        firstDefined(
            entry.status,
            entry.onlineStatus,
            entry.userStatus?.onlineStatus,
            entry.entity?.status,
            entry.entity?.onlineStatus,
            payload?.status,
            payload?.onlineStatus,
            userStatus?.onlineStatus
        )
    );
    const status = normalizedStatus || (explicitPresenceSignals ? '' : 'offline');

    const statusDescription =
        firstNonEmptyString(
            entry.statusDescription,
            entry.statusMessage,
            entry.userStatus?.statusDescription,
            entry.entity?.statusDescription,
            entry.entity?.statusMessage,
            payload?.statusDescription,
            payload?.statusMessage,
            profile?.tagline,
            profile?.description,
            currentSession?.description,
            primarySessionMetadata?.description
        ) || '';

    const profileImageUrl =
        firstNonEmptyString(
            entry.profileImageUrl,
            entry.userIcon,
            entry.iconUrl,
            entry.imageUrl,
            entry.entity?.profileImageUrl,
            entry.entity?.userIcon,
            entry.entity?.thumbnailUrl,
            payload?.profileImageUrl,
            payload?.userIcon,
            payload?.thumbnailUrl,
            profile?.iconUrl,
            profile?.profileImageUrl,
            profile?.imageUrl,
            currentSession?.thumbnailUrl
        ) || '';
    const normalizedProfileImageUrl = convertFileUrlToImageUrl(profileImageUrl);

    const locationName =
        firstNonEmptyString(
            entry.locationName,
            entry.location,
            entry.sessionName,
            entry.entity?.locationName,
            entry.entity?.location,
            payload?.locationName,
            payload?.location,
            payload?.sessionName,
            currentSession?.name,
            currentSession?.sessionName,
            currentSession?.locationName,
            primarySessionMetadata?.name,
            primarySessionMetadata?.sessionName
        ) || '';

    const ownerId = firstNonEmptyString(
        entry.ownerId,
        payload?.ownerId,
        entry.owner?.id,
        payload?.owner?.id
    );
    const contactStatus = firstNonEmptyString(
        entry.contactStatus,
        payload?.contactStatus
    );
    const latestMessageTime = firstNonEmptyString(
        entry.latestMessageTime,
        payload?.latestMessageTime,
        entry.lastSeen,
        payload?.lastSeen,
        userStatus?.lastPresenceTimestamp,
        userStatus?.lastStatusChange
    );
    const profileTagline = firstNonEmptyString(
        profile?.tagline,
        payload?.tagline
    );
    const profileDescription = firstNonEmptyString(
        profile?.description,
        payload?.description
    );
    const username = firstNonEmptyString(
        entry.contactUsername,
        entry.username,
        entry.user?.username,
        entry.entity?.username,
        payload?.contactUsername,
        payload?.username,
        profile?.username
    );
    const normalizedUsername = firstNonEmptyString(
        entry.normalizedUsername,
        entry.entity?.normalizedUsername,
        payload?.normalizedUsername,
        profile?.normalizedUsername
    );
    const registrationDate = firstNonEmptyString(
        entry.registrationDate,
        entry.entity?.registrationDate,
        payload?.registrationDate
    );
    const tags = firstStringArray(entry.tags, payload?.tags, profile?.tags);
    const isVerified = firstBoolean(
        entry.isVerified,
        entry.entity?.isVerified,
        payload?.isVerified
    );
    const hasStructuredContactData = Boolean(
        userStatus ||
        profile ||
        contactStatus ||
        latestMessageTime ||
        entry.contactUsername ||
        entry.contactDisplayName ||
        payload?.contactUsername ||
        payload?.contactDisplayName
    );
    const displayName = rawDisplayName || (hasStructuredContactData ? id : '');
    const userSessionId = firstNonEmptyString(
        userStatus?.userSessionId,
        entry.userSessionId,
        payload?.userSessionId
    );
    const sessionType = firstNonEmptyString(
        userStatus?.sessionType,
        entry.sessionType,
        payload?.sessionType
    );
    const outputDevice = firstNonEmptyString(
        userStatus?.outputDevice,
        entry.outputDevice,
        payload?.outputDevice
    );
    const appVersion = firstNonEmptyString(
        userStatus?.appVersion,
        entry.appVersion,
        payload?.appVersion
    );
    const compatibilityHash = firstNonEmptyString(
        userStatus?.compatibilityHash,
        entry.compatibilityHash,
        payload?.compatibilityHash
    );
    const isAccepted = firstBoolean(entry.isAccepted, payload?.isAccepted);
    const isMobile = firstBoolean(
        userStatus?.isMobile,
        entry.isMobile,
        payload?.isMobile
    );
    const isPresent = firstBoolean(
        userStatus?.isPresent,
        entry.isPresent,
        payload?.isPresent
    );

    if (!id || typeof id !== 'string' || id.trim() === '') {
        console.warn('[ResoniteIntegration] Entry missing valid id:', entry);
        return null;
    }

    if (
        !displayName ||
        typeof displayName !== 'string' ||
        displayName.trim() === ''
    ) {
        console.warn('[ResoniteIntegration] Entry missing valid displayName:', {
            keys: Object.keys(entry || {}),
            entityKeys:
                entry?.entity && typeof entry.entity === 'object'
                    ? Object.keys(entry.entity)
                    : [],
            entry
        });
        return null;
    }

    const currentSessionIndex = firstDefined(
        userStatus?.currentSessionIndex,
        entry.currentSessionIndex,
        payload?.currentSessionIndex
    );
    const normalizedStatusValue = String(status || '')
        .trim()
        .toLowerCase();
    const hasActiveSessionPresence = Boolean(
        isPresent ||
            firstNonEmptyString(
                currentSession?.id,
                currentSession?.sessionId,
                currentSession?.name,
                currentSession?.sessionName,
                currentSession?.locationName,
                entry.currentSessionName,
                payload?.currentSessionName,
                entry.currentSessionHash,
                payload?.currentSessionHash,
                entry.broadcastKey,
                payload?.broadcastKey
            ) ||
            (Array.isArray(sessions) && sessions.length > 0) ||
            (typeof currentSessionIndex === 'number' && currentSessionIndex >= 0)
    );
    const isExplicitlyOnline = ['online', 'busy', 'away', 'sociable'].includes(
        normalizedStatusValue
    );
    const isExplicitlyOffline = ['offline', 'invisible'].includes(
        normalizedStatusValue
    );
    const isOnline =
        isExplicitlyOnline ||
        (!isExplicitlyOffline && hasActiveSessionPresence);
    const mappedVrcxStatus = mapResoniteStatusToVrcxStatus(status, isOnline);
    const mappedVrcxLocation = locationName || (isOnline ? '' : 'offline');

    const vrcxId = `resonite:${id}`;

    const resonite = {
        userId: id,
        ownerId,
        username,
        normalizedUsername,
        contactObservedAt: Number(options?.contactObservedAt || 0),
        registrationDate,
        isVerified,
        tags,
        hasPresenceSignals: explicitPresenceSignals,
        contactStatus,
        latestMessageTime,
        isAccepted,
        onlineStatus: status,
        sessionType,
        userSessionId,
        outputDevice,
        appVersion,
        compatibilityHash,
        isMobile,
        isPresent,
        locationName,
        profile: {
            iconUrl: normalizedProfileImageUrl,
            tagline: profileTagline,
            description: profileDescription
        }
    };

    const friendContext = {
        id: vrcxId,
        name: displayName,
        state: isOnline ? 'online' : 'offline',
        isVIP: false,
        pendingOffline: false,
        provider: 'resonite',
        isExternal: true,
        ref: {
            id: vrcxId,
            displayName,
            isFriend: true,
            statusDescription: statusDescription || '',
            state: isOnline ? 'online' : 'offline',
            location: mappedVrcxLocation,
            traveling: locationName || '',
            profileImageUrl: normalizedProfileImageUrl || '',
            userIcon: normalizedProfileImageUrl || '',
            profilePicOverrideThumbnail: normalizedProfileImageUrl || '',
            profilePicOverride: normalizedProfileImageUrl || '',
            status: mappedVrcxStatus,
            contactStatus: contactStatus || '',
            latestMessageTime: latestMessageTime || '',
            isAccepted,
            resonite
        },
        resonite
    };

    console.debug(
        '[ResoniteIntegration] Normalized friend entry:',
        JSON.stringify(
            {
                id: friendContext.id,
                name: friendContext.name,
                state: friendContext.state,
                status: friendContext.ref.status,
                location: friendContext.ref.location,
                statusDescription: friendContext.ref.statusDescription,
                profileImageUrl: friendContext.ref.profileImageUrl,
                rawInputKeys: Object.keys(entry),
                rawStatus: status,
                rawIsOnline: isOnline,
                appVersion: friendContext.resonite.appVersion,
                locationName: friendContext.resonite.locationName,
                sessionType: friendContext.resonite.sessionType,
                outputDevice: friendContext.resonite.outputDevice
            },
            null,
            2
        )
    );

    return friendContext;
}

async function enrichResoniteFriendsWithUserProfiles(friends, options) {
    const { apiBaseUrl, headers } = options || {};

    if (!Array.isArray(friends) || friends.length === 0) {
        return [];
    }

    const enrichedFriends = [...friends];
    const baseUrl = getResoniteApiBaseUrl(apiBaseUrl);
    const pendingIndexes = [];

    for (let index = 0; index < friends.length; index += 1) {
        if (needsResoniteUserProfileEnrichment(friends[index], baseUrl)) {
            pendingIndexes.push(index);
        }
    }

    if (pendingIndexes.length === 0) {
        return enrichedFriends;
    }

    const profilesByUserId = await fetchResoniteUserProfiles(
        pendingIndexes
            .map((index) =>
                String(friends[index]?.resonite?.userId || '').trim()
            )
            .filter(Boolean),
        {
            apiBaseUrl: baseUrl,
            headers
        }
    );

    for (const index of pendingIndexes) {
        const userId = String(friends[index]?.resonite?.userId || '').trim();
        const userProfile = profilesByUserId.get(userId);
        if (!userProfile) {
            continue;
        }

        enrichedFriends[index] = mergeResoniteUserProfile(
            enrichedFriends[index],
            userProfile
        );
    }

    return enrichedFriends;
}

function needsResoniteUserProfileEnrichment(friend, apiBaseUrl) {
    if (!friend?.resonite?.userId) {
        return false;
    }

    const hasRichProfileData = Boolean(
        firstNonEmptyString(
            friend?.ref?.profileImageUrl,
            friend?.ref?.userIcon,
            friend?.resonite?.profile?.iconUrl
        ) &&
        firstNonEmptyString(
            friend?.resonite?.profile?.tagline,
            friend?.resonite?.profile?.description
        )
    );

    if (hasRichProfileData) {
        return Boolean(
            isResoniteUserProfileCacheStale(friend.resonite.userId, apiBaseUrl)
        );
    }

    return Boolean(
        isResoniteUserProfileCacheStale(friend.resonite.userId, apiBaseUrl) ||
        !firstNonEmptyString(
            friend?.ref?.profileImageUrl,
            friend?.ref?.userIcon,
            friend?.resonite?.profile?.iconUrl
        ) ||
        !String(friend?.resonite?.username || '').trim() ||
        !String(friend?.resonite?.registrationDate || '').trim() ||
        !String(friend?.resonite?.profile?.tagline || '').trim() ||
        !String(friend?.resonite?.profile?.description || '').trim()
    );
}

async function runResoniteProfileEnrichmentBatches(indexes, worker) {
    const batchSize = 8;

    for (let index = 0; index < indexes.length; index += batchSize) {
        const batch = indexes.slice(index, index + batchSize);
        await Promise.allSettled(batch.map((batchIndex) => worker(batchIndex)));
    }
}

export async function fetchResoniteUserProfiles(userIds, options) {
    const { apiBaseUrl, headers, apiKey, force = false } = options || {};

    const baseUrl = getResoniteApiBaseUrl(apiBaseUrl);
    const normalizedHeaders = {
        ...(headers || {})
    };

    if (!normalizedHeaders.Authorization && apiKey) {
        normalizedHeaders.Authorization =
            buildResoniteAuthorizationHeader(apiKey);
    }

    const uniqueUserIds = [
        ...new Set(
            (Array.isArray(userIds) ? userIds : [])
                .map((userId) => String(userId || '').trim())
                .filter(Boolean)
        )
    ];

    const profilesByUserId = new Map();
    const uncachedUserIds = [];

    const cachedDatabaseProfiles = force
        ? []
        : await database.getResoniteCachedProfiles(uniqueUserIds);
    hydrateResoniteUserProfileMemoryCache(cachedDatabaseProfiles, baseUrl);

    for (const userId of uniqueUserIds) {
        const cachedEntry = getResoniteUserProfileCacheEntry(userId, baseUrl);
        if (
            !force &&
            cachedEntry &&
            !isResoniteUserProfileCacheStale(userId, baseUrl)
        ) {
            profilesByUserId.set(userId, cachedEntry.value);
            continue;
        }
        uncachedUserIds.push(userId);
    }

    if (uncachedUserIds.length === 0) {
        return profilesByUserId;
    }

    await runResoniteProfileEnrichmentBatches(
        uncachedUserIds,
        async (userId) => {
            const userProfile = await fetchResoniteUserProfile(userId, {
                apiBaseUrl: baseUrl,
                headers: normalizedHeaders,
                force
            });
            if (userProfile) {
                profilesByUserId.set(userId, userProfile);
            }
        }
    );

    return profilesByUserId;
}

async function fetchResoniteUserProfile(userId, options) {
    const { apiBaseUrl, headers, force = false } = options || {};

    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
        return null;
    }

    const baseUrl = getResoniteApiBaseUrl(apiBaseUrl);
    const cacheKey = buildResoniteUserProfileCacheKey(
        normalizedUserId,
        baseUrl
    );
    const cachedEntry = getResoniteUserProfileCacheEntry(
        normalizedUserId,
        baseUrl
    );
    if (
        cachedEntry &&
        !force &&
        !isResoniteUserProfileCacheStale(normalizedUserId, baseUrl)
    ) {
        return cachedEntry.value;
    }

    try {
        const response = await webApiService.execute({
            url: `${baseUrl}/users/${encodeURIComponent(normalizedUserId)}`,
            method: 'GET',
            headers: headers || {}
        });

        if (response.status !== 200) {
            console.warn(
                `[ResoniteIntegration] Failed to enrich user ${normalizedUserId} with profile details: ${response.status}`
            );
            return null;
        }

        const payload = JSON.parse(response.data);
        await persistResoniteUserProfileCacheEntry(normalizedUserId, payload);
        resoniteUserProfileCache.set(cacheKey, {
            fetchedAt: Date.now(),
            value: payload
        });
        return payload;
    } catch (error) {
        console.warn(
            `[ResoniteIntegration] Failed to enrich user ${normalizedUserId} with profile details`,
            error
        );
        return null;
    }
}

function getResoniteUserProfileCacheEntry(userId, apiBaseUrl) {
    return resoniteUserProfileCache.get(
        buildResoniteUserProfileCacheKey(userId, apiBaseUrl)
    );
}

function hydrateResoniteUserProfileMemoryCache(entries, apiBaseUrl) {
    const baseUrl = getResoniteApiBaseUrl(apiBaseUrl);
    const now = Date.now();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const userId = String(entry?.resoniteUserId || '').trim();
        const expiresAt = Number(entry?.expiresAt || 0);
        if (!userId || (expiresAt > 0 && expiresAt <= now)) {
            continue;
        }

        const payload =
            entry?.payload && typeof entry.payload === 'object'
                ? entry.payload
                : buildResoniteUserProfilePayloadFromCacheEntry(entry);
        if (!payload || typeof payload !== 'object') {
            continue;
        }

        resoniteUserProfileCache.set(
            buildResoniteUserProfileCacheKey(userId, baseUrl),
            {
                fetchedAt: Number(entry?.fetchedAt || now),
                value: payload
            }
        );
    }
}

async function persistResoniteUserProfileCacheEntry(userId, payload) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId || !payload || typeof payload !== 'object') {
        return;
    }

    const fetchedAt = Date.now();
    await database.upsertResoniteCachedProfile({
        resoniteUserId: normalizedUserId,
        displayName: firstNonEmptyString(
            payload.displayName,
            payload.name,
            payload.profile?.displayName,
            payload.profile?.name
        ),
        username: firstNonEmptyString(
            payload.username,
            payload.contactUsername
        ),
        registrationDate: firstNonEmptyString(
            payload.registrationDate,
            payload.created,
            payload.createdAt
        ),
        isVerified: firstBoolean(payload.isVerified),
        tags: firstStringArray(payload.tags),
        iconUrl: convertFileUrlToImageUrl(
            firstNonEmptyString(
                payload.profile?.iconUrl,
                payload.profile?.profileImageUrl,
                payload.profile?.imageUrl
            )
        ),
        tagline: firstNonEmptyString(payload.profile?.tagline),
        description: firstNonEmptyString(payload.profile?.description),
        fetchedAt,
        expiresAt: fetchedAt + RESONITE_USER_PROFILE_CACHE_TTL_MS,
        payload
    });
}

function buildResoniteUserProfilePayloadFromCacheEntry(entry) {
    const profile = {
        iconUrl: String(entry?.iconUrl || '').trim(),
        tagline: String(entry?.tagline || '').trim(),
        description: String(entry?.description || '').trim()
    };

    return {
        id: String(entry?.resoniteUserId || '').trim(),
        displayName: String(entry?.displayName || '').trim(),
        username: String(entry?.username || '').trim(),
        registrationDate: String(entry?.registrationDate || '').trim(),
        isVerified:
            entry?.isVerified === undefined ? false : Boolean(entry.isVerified),
        tags: firstStringArray(entry?.tags),
        profile
    };
}

function buildResoniteUserProfileCacheKey(userId, apiBaseUrl) {
    return `${getResoniteApiBaseUrl(apiBaseUrl)}|${String(userId || '').trim()}`;
}

function isResoniteUserProfileCacheStale(userId, apiBaseUrl) {
    const cachedEntry = getResoniteUserProfileCacheEntry(userId, apiBaseUrl);
    if (!cachedEntry) {
        return true;
    }

    return (
        Date.now() - cachedEntry.fetchedAt >= RESONITE_USER_PROFILE_CACHE_TTL_MS
    );
}

export function mergeResoniteUserProfile(friend, userPayload) {
    if (!friend || !userPayload || typeof userPayload !== 'object') {
        return friend;
    }

    const profile = firstObject(userPayload.profile);
    let mergeTrace = {
        ...(friend?.resonite?.mergeTrace || {}),
        ...(friend?.ref?.resonite?.mergeTrace || {})
    };

    function recordProfileMergeTrace(
        field,
        winner,
        reason,
        existingValue,
        incomingValue,
        selectedValue
    ) {
        mergeTrace = upsertResoniteMergeTraceField(
            mergeTrace,
            'profile',
            field,
            {
                winner,
                reason,
                existingValue,
                incomingValue,
                selectedValue
            }
        );
    }

    function selectProfileStringField(field, incomingValue, ...fallbackValues) {
        const normalizedIncoming = extractMeaningfulString(incomingValue);
        const normalizedFallback = firstNonEmptyString(...fallbackValues);

        if (normalizedIncoming) {
            recordProfileMergeTrace(
                field,
                'incoming',
                'fetched-profile-authoritative',
                normalizedFallback,
                normalizedIncoming,
                normalizedIncoming
            );
            return normalizedIncoming;
        }

        recordProfileMergeTrace(
            field,
            'existing',
            normalizedFallback ? 'fetched-profile-missing' : 'no-profile-value',
            normalizedFallback,
            normalizedIncoming,
            normalizedFallback
        );
        return normalizedFallback;
    }

    function selectProfileBooleanField(
        field,
        incomingValue,
        ...fallbackValues
    ) {
        const hasIncoming = typeof incomingValue === 'boolean';
        const fallbackValue = fallbackValues.find(
            (value) => typeof value === 'boolean'
        );

        if (hasIncoming) {
            recordProfileMergeTrace(
                field,
                'incoming',
                'fetched-profile-authoritative',
                fallbackValue,
                incomingValue,
                incomingValue
            );
            return incomingValue;
        }

        recordProfileMergeTrace(
            field,
            'existing',
            fallbackValue === undefined
                ? 'no-profile-value'
                : 'fetched-profile-missing',
            fallbackValue,
            incomingValue,
            fallbackValue === undefined ? false : fallbackValue
        );
        return fallbackValue === undefined ? false : fallbackValue;
    }

    function selectProfileStringArrayField(
        field,
        incomingValue,
        ...fallbackValues
    ) {
        const incomingArray = firstStringArray(incomingValue);
        const fallbackArray = firstStringArray(...fallbackValues);

        if (incomingArray.length > 0) {
            recordProfileMergeTrace(
                field,
                'incoming',
                'fetched-profile-authoritative',
                fallbackArray,
                incomingArray,
                incomingArray
            );
            return incomingArray;
        }

        recordProfileMergeTrace(
            field,
            'existing',
            fallbackArray.length > 0
                ? 'fetched-profile-missing'
                : 'no-profile-value',
            fallbackArray,
            incomingArray,
            fallbackArray
        );
        return fallbackArray;
    }

    function selectProfileArrayField(field, incomingValue, ...fallbackValues) {
        const incomingArray = Array.isArray(incomingValue)
            ? [...incomingValue]
            : [];
        const fallbackValue = fallbackValues.find((value) =>
            Array.isArray(value)
        );
        const fallbackArray = Array.isArray(fallbackValue)
            ? [...fallbackValue]
            : [];

        if (incomingArray.length > 0) {
            recordProfileMergeTrace(
                field,
                'incoming',
                'fetched-profile-authoritative',
                fallbackArray,
                incomingArray,
                incomingArray
            );
            return incomingArray;
        }

        recordProfileMergeTrace(
            field,
            'existing',
            fallbackArray.length > 0
                ? 'fetched-profile-missing'
                : 'no-profile-value',
            fallbackArray,
            incomingArray,
            fallbackArray
        );
        return fallbackArray;
    }

    const profileIconUrl = convertFileUrlToImageUrl(
        firstNonEmptyString(
            profile?.iconUrl,
            profile?.profileImageUrl,
            profile?.imageUrl
        )
    );
    const avatarUrl =
        selectProfileStringField(
            'profile.iconUrl',
            profileIconUrl,
            friend?.ref?.profileImageUrl,
            friend?.ref?.userIcon,
            friend?.resonite?.profile?.iconUrl
        ) || '';
    const profileTagline =
        selectProfileStringField(
            'profile.tagline',
            profile?.tagline,
            friend?.resonite?.profile?.tagline
        ) || '';
    const profileDescription =
        selectProfileStringField(
            'profile.description',
            profile?.description,
            friend?.resonite?.profile?.description
        ) || '';
    const profileDisplayBadges = selectProfileArrayField(
        'profile.displayBadges',
        profile?.displayBadges,
        friend?.resonite?.profile?.displayBadges
    );
    const statusDescription =
        firstNonEmptyString(
            friend?.ref?.statusDescription,
            profileTagline,
            profileDescription
        ) || '';
    const tags = selectProfileStringArrayField(
        'tags',
        userPayload.tags,
        friend?.resonite?.tags
    );

    const username = selectProfileStringField(
        'username',
        userPayload.username,
        friend?.resonite?.username,
        friend?.ref?.displayName
    );
    const normalizedUsername = selectProfileStringField(
        'normalizedUsername',
        userPayload.normalizedUsername,
        extractMeaningfulString(userPayload.username).toLowerCase(),
        friend?.resonite?.normalizedUsername
    );
    const registrationDate = selectProfileStringField(
        'registrationDate',
        userPayload.registrationDate,
        friend?.resonite?.registrationDate
    );
    const isVerified = selectProfileBooleanField(
        'isVerified',
        userPayload.isVerified,
        friend?.resonite?.isVerified
    );

    const resonite = {
        ...(friend?.resonite || {}),
        username,
        normalizedUsername,
        registrationDate,
        isVerified,
        tags,
        mergeTrace,
        profile: {
            ...(friend?.resonite?.profile || {}),
            iconUrl: avatarUrl,
            displayBadges: profileDisplayBadges,
            tagline: profileTagline,
            description: profileDescription
        }
    };

    return {
        ...friend,
        ref: {
            ...(friend?.ref || {}),
            currentAvatarImageUrl: avatarUrl,
            currentAvatarThumbnailImageUrl: avatarUrl,
            profileImageUrl: avatarUrl,
            userIcon: avatarUrl,
            profilePicOverrideThumbnail: '',
            profilePicOverride: '',
            statusDescription,
            resonite
        },
        resonite
    };
}

function getResoniteApiBaseUrl(endpoint) {
    try {
        return new URL(String(endpoint || 'https://api.resonite.com')).origin;
    } catch {
        return 'https://api.resonite.com';
    }
}

function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    return undefined;
}

function firstObject(...values) {
    for (const value of values) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value;
        }
    }
    return null;
}

function firstArray(...values) {
    for (const value of values) {
        if (Array.isArray(value)) {
            return value;
        }
    }
    return [];
}

function firstBoolean(...values) {
    for (const value of values) {
        if (typeof value === 'boolean') {
            return value;
        }
    }
    return false;
}

function firstStringArray(...values) {
    for (const value of values) {
        if (!Array.isArray(value)) {
            continue;
        }

        const normalized = value
            .map((entry) => String(entry || '').trim())
            .filter(Boolean);
        if (normalized.length > 0) {
            return normalized;
        }
    }

    return [];
}

function normalizeStatus(value) {
    if (typeof value === 'number') {
        return (
            ['offline', 'invisible', 'away', 'busy', 'online', 'sociable'][
                value
            ] || ''
        );
    }

    return extractMeaningfulString(value).toLowerCase();
}

function hasPresenceSignals(entry) {
    if (!entry || typeof entry !== 'object') {
        return false;
    }

    const payload = firstObject(entry.entity, entry);
    const userStatus = firstObject(entry.userStatus, payload?.userStatus);
    const currentSession = firstObject(
        entry.currentSession,
        payload?.currentSession,
        userStatus?.currentSession
    );
    const sessions = firstArray(
        entry.sessions,
        payload?.sessions,
        userStatus?.sessions,
        userStatus?.decodedSessions
    );

    return Boolean(
        firstDefined(
            entry.status,
            entry.onlineStatus,
            entry.userStatus?.onlineStatus,
            payload?.status,
            payload?.onlineStatus,
            userStatus?.onlineStatus,
            currentSession?.id,
            currentSession?.sessionId,
            currentSession?.name,
            payload?.locationName,
            entry.locationName,
            userStatus?.appVersion
        ) ||
        (Array.isArray(sessions) && sessions.length > 0)
    );
}

function isContactsLikeEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return false;
    }
    return Boolean(
        entry.contactStatus ||
        entry.contactUsername ||
        entry.isAccepted !== undefined ||
        entry.latestMessageTime
    );
}

function mapResoniteStatusToVrcxStatus(status, isOnline) {
    const normalized = String(status || '')
        .trim()
        .toLowerCase();

    if (normalized === 'sociable') {
        return 'join me';
    }
    if (normalized === 'busy') {
        return 'busy';
    }
    if (normalized === 'away') {
        return 'ask me';
    }
    if (isOnline) {
        return 'active';
    }

    return '';
}
function firstNonEmptyString(...values) {
    for (const value of values) {
        const normalized = extractMeaningfulString(value);
        if (normalized) {
            return normalized;
        }
    }
    return '';
}

function extractMeaningfulString(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || '';
    }

    if (!value || typeof value !== 'object') {
        return '';
    }

    const objectCandidates = [
        value.displayName,
        value.username,
        value.name,
        value.value,
        value.text,
        value.label
    ];

    for (const candidate of objectCandidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }

    return '';
}

/**
 * @param {Object} friendContext
 * @returns {boolean}
 */
export function isValidResoniteFriendContext(friendContext) {
    if (!friendContext || typeof friendContext !== 'object') {
        return false;
    }

    return Boolean(
        typeof friendContext.id === 'string' &&
        friendContext.id.startsWith('resonite:') &&
        typeof friendContext.name === 'string' &&
        (friendContext.state === 'online' ||
            friendContext.state === 'offline') &&
        friendContext.provider === 'resonite' &&
        friendContext.isExternal === true &&
        friendContext.ref &&
        typeof friendContext.ref.id === 'string' &&
        typeof friendContext.ref.displayName === 'string'
    );
}
