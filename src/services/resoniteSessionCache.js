export function createResoniteSessionCache({
    onSessionDataChanged = () => {}
} = {}) {
    function mergeSessionData(existingPayload, incomingPayload) {
        if (!existingPayload || typeof existingPayload !== 'object') {
            return incomingPayload;
        }
        if (!incomingPayload || typeof incomingPayload !== 'object') {
            return existingPayload;
        }

        const merged = {
            ...existingPayload,
            ...incomingPayload
        };

        for (const key of Object.keys(existingPayload)) {
            const incomingValue = incomingPayload[key];
            const existingValue = existingPayload[key];

            if (Array.isArray(existingValue)) {
                if (
                    !Array.isArray(incomingValue) ||
                    incomingValue.length === 0
                ) {
                    merged[key] = existingValue;
                }
                continue;
            }

            if (
                existingValue &&
                typeof existingValue === 'object' &&
                !Array.isArray(existingValue)
            ) {
                if (
                    incomingValue &&
                    typeof incomingValue === 'object' &&
                    !Array.isArray(incomingValue)
                ) {
                    merged[key] = mergeSessionData(
                        existingValue,
                        incomingValue
                    );
                } else if (
                    incomingValue === undefined ||
                    incomingValue === null ||
                    incomingValue === ''
                ) {
                    merged[key] = existingValue;
                }
                continue;
            }

            if (
                incomingValue === undefined ||
                incomingValue === null ||
                incomingValue === ''
            ) {
                merged[key] = existingValue;
            }
        }

        return merged;
    }

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

            const existingPayload = cache.sessionDataByHash.get(normalizedHash);
            cache.sessionDataByHash.set(
                normalizedHash,
                mergeSessionData(existingPayload, sessionPayload)
            );
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
