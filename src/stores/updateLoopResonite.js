export function getResoniteRefreshScopeKey(currentUserId) {
    const normalized = String(currentUserId || '').trim();
    return normalized ? `vrcx-user-${normalized}` : '';
}

export function calculateResoniteRefreshDelaySeconds(
    syncState,
    refreshSeconds,
    now = Date.now()
) {
    const baseRefreshSeconds = Math.max(30, Number(refreshSeconds) || 300);
    const nextRetryAt = Number(syncState?.nextSnapshotRetryAt || 0);

    if (nextRetryAt > now) {
        return Math.max(1, Math.ceil((nextRetryAt - now) / 1000));
    }

    return baseRefreshSeconds;
}
