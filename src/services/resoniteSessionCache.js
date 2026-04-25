export function createResoniteSessionCache({
    onSessionDataChanged = () => {}
} = {}) {
    const cache = {
        sessionNamesByHash: new Map(),
        sessionDataByHash: new Map(),
        resolutionPromisesByHash: new Map(),
        resolutionMissesByHash: new Map(),
        hostSessionsByUserId: new Map(),
        hostSessionPromisesByUserId: new Map(),
        visibleSessions: {
            fetchedAt: 0,
            sessions: []
        },
        visibleSessionsPromise: null,

        setSessionData(sessionHash, sessionPayload) {
            const normalizedHash = String(sessionHash || '').trim();
            if (
                !normalizedHash ||
                !sessionPayload ||
                typeof sessionPayload !== 'object'
            ) {
                return;
            }

            cache.sessionDataByHash.set(normalizedHash, sessionPayload);
            onSessionDataChanged();
        },

        getSessionData(sessionHash) {
            const normalizedHash = String(sessionHash || '').trim();
            return normalizedHash
                ? (cache.sessionDataByHash.get(normalizedHash) ?? null)
                : null;
        },

        getSessionName(sessionHash) {
            const normalizedHash = String(sessionHash || '').trim();
            return normalizedHash
                ? String(
                      cache.sessionNamesByHash.get(normalizedHash) || ''
                  ).trim()
                : '';
        },

        clearResolvedSessions({ notify = true } = {}) {
            cache.sessionNamesByHash.clear();
            cache.sessionDataByHash.clear();
            if (notify) {
                onSessionDataChanged();
            }
        },

        resetVisibleSessions() {
            cache.visibleSessions = {
                fetchedAt: 0,
                sessions: []
            };
            cache.visibleSessionsPromise = null;
        },

        resetAll() {
            cache.clearResolvedSessions({ notify: false });
            cache.resolutionPromisesByHash.clear();
            cache.resolutionMissesByHash.clear();
            cache.hostSessionsByUserId.clear();
            cache.hostSessionPromisesByUserId.clear();
            cache.resetVisibleSessions();
            onSessionDataChanged();
        },

        deleteResolutionMiss(sessionHash) {
            cache.resolutionMissesByHash.delete(
                String(sessionHash || '').trim()
            );
        },

        deleteHostSessions(userId) {
            cache.hostSessionsByUserId.delete(String(userId || '').trim());
            cache.hostSessionPromisesByUserId.delete(
                String(userId || '').trim()
            );
        }
    };

    return cache;
}
