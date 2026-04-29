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
    return firstNonEmptyString(
        friendLike?.resonite?.currentSessionHash,
        friendLike?.resonite?.realtime?.currentSessionHash,
        friendLike?.ref?.resonite?.currentSessionHash,
        friendLike?.ref?.resonite?.realtime?.currentSessionHash
    );
}

export function getResoniteSessionGroupingKey(friendLike, resolvedSession) {
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
        friendLike?.ref?.resonite?.realtime?.sessionId
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
        friendLike?.ref?.resonite?.realtime?.broadcastKey
    );
    if (broadcastKey) {
        return `broadcast:${broadcastKey}`;
    }

    const currentSessionHash = getResoniteCurrentSessionHash(friendLike);
    return currentSessionHash ? `hash:${currentSessionHash}` : '';
}
