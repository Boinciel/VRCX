export function normalizeResoniteHandle(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

export function stripResonitePrefix(id) {
    const normalizedId = String(id || '').trim();
    return normalizedId.startsWith('resonite:')
        ? normalizedId.slice('resonite:'.length)
        : normalizedId;
}

export function isResoniteContactLike(friendLike) {
    const resonite = friendLike?.resonite || friendLike?.ref?.resonite || {};

    return Boolean(
        friendLike?.ref?.contactStatus ||
        resonite.contactStatus ||
        friendLike?.ref?.contactUsername ||
        resonite.contactUsername ||
        friendLike?.ref?.latestMessageTime ||
        resonite.latestMessageTime ||
        friendLike?.ref?.isAccepted !== undefined ||
        resonite.isAccepted !== undefined
    );
}
