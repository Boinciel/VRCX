export function normalizeResoniteHandle(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
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

function getResoniteSessionId(sessionLike) {
    return firstNonEmptyString(
        sessionLike?.sessionId,
        sessionLike?.sessionID,
        sessionLike?.id,
        sessionLike?.session?.sessionId,
        sessionLike?.session?.sessionID,
        sessionLike?.session?.id,
        sessionLike?.sessionInfo?.sessionId,
        sessionLike?.sessionInfo?.sessionID,
        sessionLike?.sessionInfo?.id
    );
}

function getResoniteSessionBroadcastKey(sessionLike) {
    return firstNonEmptyString(
        sessionLike?.broadcastKey,
        sessionLike?.session?.broadcastKey,
        sessionLike?.sessionInfo?.broadcastKey
    );
}

function getResoniteSessions(friendLike) {
    const candidateCollections = [
        friendLike?.resonite?.sessions,
        friendLike?.resonite?.realtime?.sessions,
        friendLike?.ref?.resonite?.sessions,
        friendLike?.ref?.resonite?.realtime?.sessions
    ];

    for (const sessions of candidateCollections) {
        if (Array.isArray(sessions) && sessions.length > 0) {
            return sessions;
        }
    }

    return [];
}

function getResoniteCurrentSessionMetadata(friendLike) {
    const sessions = getResoniteSessions(friendLike);
    if (sessions.length === 0) {
        return null;
    }

    const currentSessionId = firstNonEmptyString(
        friendLike?.resonite?.sessionId,
        friendLike?.resonite?.realtime?.sessionId,
        friendLike?.ref?.resonite?.sessionId,
        friendLike?.ref?.resonite?.realtime?.sessionId
    );
    if (currentSessionId) {
        const matchingSessionById = sessions.find(
            (session) => getResoniteSessionId(session) === currentSessionId
        );
        if (matchingSessionById) {
            return matchingSessionById;
        }
    }

    const currentBroadcastKey = firstNonEmptyString(
        friendLike?.resonite?.broadcastKey,
        friendLike?.resonite?.realtime?.broadcastKey,
        friendLike?.ref?.resonite?.broadcastKey,
        friendLike?.ref?.resonite?.realtime?.broadcastKey
    );
    if (currentBroadcastKey) {
        const matchingSessionByBroadcastKey = sessions.find(
            (session) =>
                getResoniteSessionBroadcastKey(session) === currentBroadcastKey
        );
        if (matchingSessionByBroadcastKey) {
            return matchingSessionByBroadcastKey;
        }
    }

    const currentSessionIndex = Number(
        firstNonEmptyString(
            friendLike?.resonite?.currentSessionIndex,
            friendLike?.resonite?.realtime?.currentSessionIndex,
            friendLike?.ref?.resonite?.currentSessionIndex,
            friendLike?.ref?.resonite?.realtime?.currentSessionIndex
        )
    );
    if (
        Number.isInteger(currentSessionIndex) &&
        currentSessionIndex >= 0 &&
        currentSessionIndex < sessions.length
    ) {
        return sessions[currentSessionIndex];
    }

    const currentSessionHash = firstNonEmptyString(
        friendLike?.resonite?.currentSessionHash,
        friendLike?.resonite?.realtime?.currentSessionHash,
        friendLike?.ref?.resonite?.currentSessionHash,
        friendLike?.ref?.resonite?.realtime?.currentSessionHash
    );
    if (currentSessionHash) {
        const matchingSessionByHash = sessions.find(
            (session) =>
                firstNonEmptyString(
                    session?.sessionHash,
                    session?.session?.sessionHash,
                    session?.sessionInfo?.sessionHash
                ) === currentSessionHash
        );
        if (matchingSessionByHash) {
            return matchingSessionByHash;
        }
    }

    return sessions.length === 1 ? sessions[0] : null;
}

export function stripResonitePrefix(id) {
    const normalizedId = String(id || '').trim();
    return normalizedId.startsWith('resonite:')
        ? normalizedId.slice('resonite:'.length)
        : normalizedId;
}

export function isResoniteContactLike(friendLike) {
    const resonite = friendLike?.resonite || friendLike?.ref?.resonite || {};
    const hasRelationshipMetadata = Boolean(
        friendLike?.ref?.contactStatus ||
        resonite.contactStatus ||
        friendLike?.ref?.contactUsername ||
        resonite.contactUsername ||
        friendLike?.ref?.latestMessageTime ||
        resonite.latestMessageTime
    );
    const isAcceptedContact =
        friendLike?.ref?.isAccepted === true || resonite.isAccepted === true;

    return hasRelationshipMetadata || isAcceptedContact;
}

export function getResoniteCurrentSessionHash(friendLike) {
    const currentSession = getResoniteCurrentSessionMetadata(friendLike);

    return firstNonEmptyString(
        friendLike?.resonite?.currentSessionHash,
        friendLike?.resonite?.realtime?.currentSessionHash,
        friendLike?.ref?.resonite?.currentSessionHash,
        friendLike?.ref?.resonite?.realtime?.currentSessionHash,
        currentSession?.sessionHash,
        currentSession?.session?.sessionHash,
        currentSession?.sessionInfo?.sessionHash
    );
}

export function getResoniteSessionGroupingKey(friendLike, resolvedSession) {
    const currentSession = getResoniteCurrentSessionMetadata(friendLike);

    const resolvedSessionId = firstNonEmptyString(
        resolvedSession?.sessionId,
        resolvedSession?.sessionID,
        resolvedSession?.id,
        resolvedSession?.session?.sessionId,
        resolvedSession?.session?.sessionID,
        resolvedSession?.session?.id,
        resolvedSession?.sessionInfo?.sessionId,
        resolvedSession?.sessionInfo?.sessionID,
        resolvedSession?.sessionInfo?.id
    );
    const preservedSessionId = firstNonEmptyString(
        friendLike?.resonite?.sessionId,
        friendLike?.resonite?.realtime?.sessionId,
        friendLike?.ref?.resonite?.sessionId,
        friendLike?.ref?.resonite?.realtime?.sessionId,
        getResoniteSessionId(currentSession)
    );
    if (resolvedSessionId) {
        return `session:${resolvedSessionId}`;
    }
    if (preservedSessionId) {
        return `session:${preservedSessionId}`;
    }

    const broadcastKey = firstNonEmptyString(
        resolvedSession?.broadcastKey,
        resolvedSession?.session?.broadcastKey,
        resolvedSession?.sessionInfo?.broadcastKey,
        friendLike?.resonite?.broadcastKey,
        friendLike?.resonite?.realtime?.broadcastKey,
        friendLike?.ref?.resonite?.broadcastKey,
        friendLike?.ref?.resonite?.realtime?.broadcastKey,
        getResoniteSessionBroadcastKey(currentSession)
    );
    if (broadcastKey) {
        return `broadcast:${broadcastKey}`;
    }

    const currentSessionHash = getResoniteCurrentSessionHash(friendLike);
    return currentSessionHash ? `hash:${currentSessionHash}` : '';
}
