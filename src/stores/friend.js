import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import { useRouter } from 'vue-router';

import { i18n } from '../plugins/i18n';
import {
    compareByCreatedAtAscending,
    createRateLimiter,
    executeWithBackoff,
    getFriendsSortFunction,
    isRealInstance
} from '../shared/utils';
import {
    getResoniteCurrentSessionHash,
    getResoniteSessionGroupingKey,
    normalizeResoniteHandle,
    stripResonitePrefix
} from '../shared/utils/resonite';
import { getUserMemo } from '../coordinators/memoCoordinator';
import { friendRequest, userRequest } from '../api';
import { runInitFriendsListFlow } from '../coordinators/friendSyncCoordinator';
import {
    runPendingOfflineTickFlow,
    runUpdateFriendFlow
} from '../coordinators/friendPresenceCoordinator';
import { syncFriendSearchIndex } from '../coordinators/searchIndexCoordinator';
import {
    updateFriendship,
    runUpdateFriendshipsFlow
} from '../coordinators/friendRelationshipCoordinator';
import { applyUser } from '../coordinators/userCoordinator';
import { AppDebug } from '../services/appConfig';
import { database } from '../services/database';
import { buildResonitePresenceFeedUpdate } from '../services/resoniteFeedEvents';
import {
    fetchResoniteFriends,
    mergeResoniteUserProfile
} from '../services/resoniteFriends';
import {
    shouldPreferIncomingResoniteContactFields,
    upsertResoniteMergeTraceField
} from '../services/resoniteMerge';
import {
    clearResoniteRealtimeState,
    ensureResoniteRealtimePresence,
    getResoniteSessionByHash,
    hydratePersistedResoniteRealtimeState,
    mergeResoniteRealtimePresence,
    reconcileResoniteRealtimeAgainstSnapshot,
    setResoniteRealtimePresenceListener,
    stopResoniteRealtimePresence
} from '../services/resoniteRealtime';
import { useAppearanceSettingsStore } from './settings/appearance';
import { useAdvancedSettingsStore } from './settings/advanced';
import { useFavoriteStore } from './favorite';
import { useFeedStore } from './feed';
import { useGeneralSettingsStore } from './settings/general';
import { useGroupStore } from './group';
import { useNotificationStore } from './notification';
import { useResoniteCredentialsStore } from './resoniteCredentials';
import { useSharedFeedStore } from './sharedFeed';
import { useUiStore } from './ui';
import { useLocationStore } from './location';
import { useUserStore } from './user';
import { watchState } from '../services/watchState';

import configRepository from '../services/config';

import * as workerTimers from 'worker-timers';

export const useFriendStore = defineStore('Friend', () => {
    const RESONITE_SNAPSHOT_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;
    const RESONITE_SNAPSHOT_CACHE_MAX_FRIENDS = 300;
    const RESONITE_SNAPSHOT_MAX_BACKOFF_MS = 1000 * 60 * 30;
    const RESONITE_PRESENCE_MAX_BACKOFF_MS = 1000 * 60 * 30;
    const RESONITE_REALTIME_EPOCH_MS_FLOOR = 1_000_000_000_000;

    const appearanceSettingsStore = useAppearanceSettingsStore();
    const advancedSettingsStore = useAdvancedSettingsStore();
    const feedStore = useFeedStore();
    const generalSettingsStore = useGeneralSettingsStore();
    const userStore = useUserStore();
    const groupStore = useGroupStore();
    const locationStore = useLocationStore();
    const notificationStore = useNotificationStore();
    const sharedFeedStore = useSharedFeedStore();
    const uiStore = useUiStore();

    const router = useRouter();
    const t = i18n.global.t;

    const state = reactive({
        friendNumber: 0
    });

    const friendLog = new Map();

    const friends = reactive(new Map());
    const lastResoniteFriendsSnapshot = shallowRef([]);
    let lastResonitePersistenceUserId = '';
    let persistResoniteSnapshotTimer = null;
    let resoniteSelfFeedSnapshot = null;

    const localFavoriteFriends = reactive(new Set());
    const sortedFriends = shallowRef([]);
    let sortedFriendsBatchDepth = 0;
    let pendingSortedFriendsRebuild = false;
    let allUserStatsRequestId = 0;
    let allUserMutualCountRequestId = 0;
    let allUserMutualOptedOutRequestId = 0;

    const derivedDebugCounters = reactive({
        allFavoriteFriendIds: 0,
        allFavoriteOnlineFriends: 0,
        vipFriends: 0,
        onlineFriends: 0,
        activeFriends: 0,
        offlineFriends: 0,
        friendsInSameInstance: 0
    });

    /**
     * Tracks recomputes for the hottest friend-derived lists.
     * Guarded by AppDebug.debugRecompute so normal behavior stays unchanged.
     * @param {keyof typeof derivedDebugCounters} name
     * @param {number} resultSize
     */
    function trackDerivedDebug(name, resultSize) {
        derivedDebugCounters[name] += 1;
        if (!AppDebug.debugRecompute) {
            return;
        }
        console.log('[friendStore derived]', {
            name,
            count: derivedDebugCounters[name],
            resultSize,
            friendCount: friends.size,
            sortMethods: appearanceSettingsStore.sidebarSortMethods
        });
    }

    /**
     *
     */
    function resetDerivedDebugCounters() {
        for (const key in derivedDebugCounters) {
            derivedDebugCounters[key] = 0;
        }
        if (AppDebug.debugRecompute) {
            console.log('[friendStore derived] counters reset');
        }
    }

    function isVrchatMutualEligibleFriend(ctx) {
        const id = String(ctx?.id || '').trim();
        return Boolean(
            id.startsWith('usr_') &&
            ctx?.isExternal !== true &&
            ctx?.provider !== 'resonite'
        );
    }

    /**
     *
     * @returns {Record<string, number>}
     */
    function getDerivedDebugCounters() {
        const snapshot = { ...derivedDebugCounters };
        if (AppDebug.debugRecompute) {
            console.log('[friendStore derived] counters snapshot', snapshot);
        }
        return snapshot;
    }

    const allFavoriteFriendIds = computed(() => {
        const favoriteStore = useFavoriteStore();
        const set = new Set();
        for (const ref of favoriteStore.cachedFavorites.values()) {
            if (ref.type === 'friend') {
                set.add(ref.favoriteId);
            }
        }
        for (const groupName in favoriteStore.localFriendFavorites) {
            const userIds = favoriteStore.localFriendFavorites[groupName];
            if (userIds) {
                for (const id of userIds) {
                    set.add(id);
                }
            }
        }
        trackDerivedDebug('allFavoriteFriendIds', set.size);
        return set;
    });

    /**
     *
     * @returns {(a: object, b: object) => number}
     */
    function getSortedFriendsComparator() {
        return getFriendsSortFunction(
            appearanceSettingsStore.sidebarSortMethods
        );
    }

    /**
     *
     * @param {string} id
     * @returns {number}
     */
    function findSortedFriendIndex(id) {
        return sortedFriends.value.findIndex((friend) => friend.id === id);
    }

    /**
     *
     */
    function rebuildSortedFriends() {
        sortedFriends.value = Array.from(friends.values()).sort(
            getSortedFriendsComparator()
        );
        pendingSortedFriendsRebuild = false;
    }

    /**
     *
     */
    function beginSortedFriendsBatch() {
        sortedFriendsBatchDepth += 1;
    }

    /**
     *
     */
    function endSortedFriendsBatch() {
        if (sortedFriendsBatchDepth === 0) {
            return;
        }
        sortedFriendsBatchDepth -= 1;
        if (sortedFriendsBatchDepth === 0 && pendingSortedFriendsRebuild) {
            rebuildSortedFriends();
        }
    }

    /**
     *
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    function runInSortedFriendsBatch(fn) {
        beginSortedFriendsBatch();
        try {
            return fn();
        } finally {
            endSortedFriendsBatch();
        }
    }

    /**
     *
     * @param {string} id
     */
    function removeSortedFriend(id) {
        if (sortedFriendsBatchDepth > 0) {
            pendingSortedFriendsRebuild = true;
            return;
        }
        const index = findSortedFriendIndex(id);
        if (index === -1) {
            return;
        }
        const next = sortedFriends.value.slice();
        next.splice(index, 1);
        sortedFriends.value = next;
    }

    /**
     *
     * @param {object | string} input
     */
    function reindexSortedFriend(input) {
        const ctx = typeof input === 'string' ? friends.get(input) : input;
        if (!ctx) {
            return;
        }
        if (sortedFriendsBatchDepth > 0) {
            pendingSortedFriendsRebuild = true;
            return;
        }
        const compare = getSortedFriendsComparator();
        const next = sortedFriends.value.slice();
        const existingIndex = next.findIndex((friend) => friend.id === ctx.id);
        if (existingIndex !== -1) {
            next.splice(existingIndex, 1);
        }
        let low = 0;
        let high = next.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (compare(next[mid], ctx) <= 0) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        next.splice(low, 0, ctx);
        sortedFriends.value = next;
    }

    const allFavoriteOnlineFriends = computed(() => {
        const favoriteIds = allFavoriteFriendIds.value;
        const result = sortedFriends.value.filter(
            (f) => f.state === 'online' && favoriteIds.has(f.id)
        );
        trackDerivedDebug('allFavoriteOnlineFriends', result.length);
        return result;
    });

    const isRefreshFriendsLoading = ref(false);
    const onlineFriendCount = ref(0);

    const pendingOfflineDelay = 170000;
    let pendingOfflineWorker = null;
    const pendingOfflineMap = new Map();

    const friendLogTable = ref({
        data: [],
        filters: [
            {
                prop: 'type',
                value: []
            },
            {
                prop: 'displayName',
                value: ''
            },
            {
                prop: 'type',
                value: false,
                filterFn: (row, filter) =>
                    !(filter.value && row.type === 'Unfriend')
            }
        ],
        pageSizeLinked: true,
        loading: false
    });

    watch(
        router.currentRoute,
        (value) => {
            if (value.name === 'friend-log') {
                initFriendLogHistoryTable();
            } else {
                friendLogTable.value.data = [];
            }
        },
        { immediate: true }
    );

    const vipFriends = computed(() => {
        const result = sortedFriends.value.filter(
            (f) => f.state === 'online' && f.isVIP
        );
        trackDerivedDebug('vipFriends', result.length);
        return result;
    });

    const onlineFriends = computed(() => {
        const result = sortedFriends.value.filter(
            (f) => f.state === 'online' && !f.isVIP
        );
        trackDerivedDebug('onlineFriends', result.length);
        return result;
    });

    const activeFriends = computed(() => {
        const result = sortedFriends.value.filter((f) => f.state === 'active');
        trackDerivedDebug('activeFriends', result.length);
        return result;
    });

    const offlineFriends = computed(() => {
        const result = sortedFriends.value.filter(
            (f) => f.state === 'offline' || !f.state
        );
        trackDerivedDebug('offlineFriends', result.length);
        return result;
    });

    const friendsInSameInstance = computed(() => {
        const friendsList = {};

        sortedFriends.value.forEach((friend) => {
            if (friend.state !== 'online') {
                return;
            }
            if (!friend.ref?.$location) {
                return;
            }

            let locationTag = friend.ref?.$location?.tag;
            if (!locationTag) {
                return;
            }
            if (
                !friend.ref?.$location?.isRealInstance &&
                locationStore.lastLocation?.friendList?.has(friend.id)
            ) {
                locationTag =
                    locationStore.lastLocation?.location || locationTag;
            }
            const isReal = isRealInstance(locationTag);
            if (!isReal) {
                return;
            }

            if (!friendsList[locationTag]) {
                friendsList[locationTag] = [];
            }
            friendsList[locationTag].push(friend);
        });

        const sortedFriendsList = [];
        for (const group of Object.values(friendsList)) {
            if (group.length > 1) {
                // Group order already matches the globally sorted online list.
                sortedFriendsList.push(group);
            }
        }

        const result = sortedFriendsList.sort((a, b) => b.length - a.length);
        trackDerivedDebug('friendsInSameInstance', result.length);
        return result;
    });

    const resoniteFriendsInSameSession = computed(() => {
        const sessionGroups = {};

        sortedFriends.value.forEach((friend) => {
            if (friend.provider !== 'resonite' || friend.state !== 'online') {
                return;
            }
            const currentSessionHash = getResoniteCurrentSessionHash(friend);
            const resolvedSession = currentSessionHash
                ? getResoniteSessionByHash(currentSessionHash)
                : null;
            const sessionGroupKey = getResoniteSessionGroupingKey(
                friend,
                resolvedSession
            );
            if (!sessionGroupKey) {
                return;
            }
            const accessLevel = String(
                resolvedSession?.accessLevel ||
                    friend.resonite?.accessLevel ||
                    friend.resonite?.realtime?.accessLevel ||
                    friend.ref?.resonite?.accessLevel ||
                    friend.ref?.resonite?.realtime?.accessLevel ||
                    ''
            ).trim();
            if (accessLevel === 'private') {
                return;
            }
            if (!sessionGroups[sessionGroupKey]) {
                sessionGroups[sessionGroupKey] = [];
            }
            sessionGroups[sessionGroupKey].push(friend);
        });

        const sortedSessionList = [];
        for (const group of Object.values(sessionGroups)) {
            if (group.length > 1) {
                sortedSessionList.push(group);
            }
        }

        return sortedSessionList.sort((a, b) => b.length - a.length);
    });

    watch(
        () => watchState.isLoggedIn,
        (isLoggedIn) => {
            friends.clear();
            sortedFriends.value = [];
            pendingSortedFriendsRebuild = false;
            state.friendNumber = 0;
            friendLog.clear();
            friendLogTable.value.data = [];
            groupStore.clearGroupInstances();
            onlineFriendCount.value = 0;
            pendingOfflineMap.clear();
            if (isLoggedIn) {
                runInitFriendsListFlow(i18n.global.t);
                pendingOfflineWorkerFunction();
            } else {
                if (pendingOfflineWorker !== null) {
                    workerTimers.clearInterval(pendingOfflineWorker);
                    pendingOfflineWorker = null;
                }

                stopResoniteRealtimePresence().catch((error) => {
                    console.warn(
                        '[ResoniteIntegration] Failed to stop realtime presence on logout:',
                        error
                    );
                });
            }
        },
        { flush: 'sync' }
    );

    watch(
        () => advancedSettingsStore.resoniteIntegration,
        (enabled) => {
            if (enabled) {
                return;
            }

            void clearResoniteState({
                clearPersisted: false,
                stopRealtime: true
            }).catch((error) => {
                console.warn(
                    '[ResoniteIntegration] Failed to clear Resonite state after disabling integration:',
                    error
                );
            });
        },
        { flush: 'sync' }
    );

    watch(
        () =>
            parseResoniteUserIdFromApiKey(advancedSettingsStore.resoniteApiKey),
        (nextUserId, previousUserId) => {
            if (!watchState.isLoggedIn) {
                return;
            }

            const normalizedPreviousUserId =
                normalizeResoniteHandle(previousUserId);
            const normalizedNextUserId = normalizeResoniteHandle(nextUserId);
            if (
                !normalizedPreviousUserId ||
                normalizedPreviousUserId === normalizedNextUserId
            ) {
                return;
            }

            void clearResoniteState({
                clearPersisted: true,
                stopRealtime: true
            }).catch((error) => {
                console.warn(
                    '[ResoniteIntegration] Failed to clear Resonite state after account switch:',
                    error
                );
            });
        },
        { flush: 'sync' }
    );

    watch(
        () => appearanceSettingsStore.sidebarSortMethods,
        () => {
            rebuildSortedFriends();
        },
        { deep: true }
    );

    watch(
        () => watchState.isFriendsLoaded,
        (isFriendsLoaded) => {
            if (isFriendsLoaded) {
                updateOnlineFriendCounter();
            }
        },
        { flush: 'sync' }
    );

    /**
     *
     */
    async function init() {
        const friendLogTableFiltersValue = JSON.parse(
            await configRepository.getString('VRCX_friendLogTableFilters', '[]')
        );
        friendLogTable.value.filters[0].value = friendLogTableFiltersValue;
    }

    init();

    /**
     *
     */
    function updateLocalFavoriteFriends() {
        const favoriteStore = useFavoriteStore();
        localFavoriteFriends.clear();
        const groups = generalSettingsStore.localFavoriteFriendsGroups;
        const hasRemoteGroupFilter = groups.some(
            (key) => !key.startsWith('local:')
        );
        // Remote favorites: filter by selected remote groups
        for (const ref of favoriteStore.cachedFavorites.values()) {
            if (
                ref.type === 'friend' &&
                (!hasRemoteGroupFilter || groups.includes(ref.$groupKey))
            ) {
                localFavoriteFriends.add(ref.favoriteId);
            }
        }
        // Local favorites: always include all
        for (const groupName in favoriteStore.localFriendFavorites) {
            const userIds = favoriteStore.localFriendFavorites[groupName];
            if (userIds) {
                for (let i = 0; i < userIds.length; ++i) {
                    localFavoriteFriends.add(userIds[i]);
                }
            }
        }
        updateSidebarFavorites();
    }

    /**
     *
     */
    function updateSidebarFavorites() {
        runInSortedFriendsBatch(() => {
            for (const ctx of friends.values()) {
                const isVIP = localFavoriteFriends.has(ctx.id);
                if (ctx.isVIP === isVIP) {
                    continue;
                }
                ctx.isVIP = isVIP;
                reindexSortedFriend(ctx);
            }
        });
    }

    /**
     *
     */
    async function pendingOfflineWorkerFunction() {
        pendingOfflineWorker = workerTimers.setInterval(() => {
            runPendingOfflineTickFlow();
        }, 1000);
    }

    /**
     * @param {string} id
     */
    function deleteFriend(id) {
        const ctx = friends.get(id);
        if (typeof ctx === 'undefined') {
            return;
        }
        friends.delete(id);
        removeSortedFriend(id);
    }

    /**
     *
     * @param ref
     */
    function refreshFriendsStatus(ref) {
        return runInSortedFriendsBatch(() => {
            let id;
            const map = new Map();
            for (id of ref.friends) {
                map.set(id, 'offline');
            }
            for (id of ref.offlineFriends) {
                map.set(id, 'offline');
            }
            for (id of ref.activeFriends) {
                map.set(id, 'active');
            }
            for (id of ref.onlineFriends) {
                map.set(id, 'online');
            }
            const added = [];
            const removed = [];
            for (const friend of map) {
                const [id, state_input] = friend;
                if (friends.has(id)) {
                    runUpdateFriendFlow(id, state_input);
                } else {
                    addFriend(id, state_input);
                    added.push(id);
                }
            }
            for (id of friends.keys()) {
                const existingCtx = friends.get(id);
                // Preserve external-provider entries (e.g. Resonite) when
                // reconciling the VRChat friend snapshot.
                if (
                    map.has(id) === false &&
                    !existingCtx?.isExternal &&
                    existingCtx?.provider !== 'resonite'
                ) {
                    deleteFriend(id);
                    removed.push(id);
                }
            }
            return { added, removed };
        });
    }

    /**
     * @param {string} id
     * @param {string?} state_input
     */
    function addFriend(id, state_input = undefined) {
        if (friends.has(id)) {
            return;
        }
        const ref = userStore.cachedUsers.get(id);
        const isVIP = localFavoriteFriends.has(id);
        let name = '';
        const friend = friendLog.get(id);
        if (friend) {
            name = friend.displayName;
        }
        const ctx = reactive({
            id,
            state: state_input || 'offline',
            isVIP,
            ref,
            name,
            memo: '',
            pendingOffline: false,
            $nickName: ''
        });
        if (watchState.isFriendsLoaded) {
            getUserMemo(id).then((memo) => {
                if (memo.userId === id) {
                    ctx.memo = memo.memo;
                    ctx.$nickName = '';
                    if (memo.memo) {
                        const array = memo.memo.split('\n');
                        ctx.$nickName = array[0];
                    }
                    syncFriendSearchIndex(ctx);
                }
            });
        }
        if (typeof ref === 'undefined') {
            const friendLogRef = friendLog.get(id);
            if (friendLogRef?.displayName) {
                ctx.name = friendLogRef.displayName;
            }
        } else {
            ctx.name = ref.name;
        }
        friends.set(id, ctx);
        watchState.isLoggedIn = true;
        // Startup fill flow:
        //
        // login
        // -> runInitFriendsListFlow()
        // -> initFriendLog() / getFriendLog()
        // -> refreshFriendsStatus(currentUser)
        // -> addFriend(...)
        // -> friends.set(id, ctx)
        // -> reindexSortedFriend(ctx)
        //
        // During batch init, reindexSortedFriend() only marks the list dirty.
        // When the batch ends:
        // -> rebuildSortedFriends()
        // -> sortedFriends = sorted(Array.from(friends.values()))
        //
        // After full friend payloads arrive:
        // -> applyUser(friend)
        // -> update ctx.ref / ctx.name
        // -> reindexSortedFriend(ctx)
        // -> batch end
        // -> rebuildSortedFriends()
        reindexSortedFriend(ctx);
    }

    /**
     *
     * @returns {Promise<*[]>}
     */
    async function refreshFriends() {
        isRefreshFriendsLoading.value = true;
        try {
            const onlineFriends = await bulkRefreshFriends({
                offline: false
            });
            const offlineFriends = await bulkRefreshFriends({
                offline: true
            });
            var friends = onlineFriends.concat(offlineFriends);
            friends = await refetchBrokenFriends(friends);
            if (!watchState.isFriendsLoaded) {
                friends = await refreshRemainingFriends(friends);
            }

            isRefreshFriendsLoading.value = false;
            return friends;
        } catch (err) {
            isRefreshFriendsLoading.value = false;
            throw err;
        }
    }

    /**
     * @param {object} args
     * @returns {Promise<*[]>}
     */
    async function bulkRefreshFriends(args) {
        // API offset limit *was* 5000
        // it is now 7500
        const MAX_OFFSET = 7500;
        const PAGE_SIZE = 50;
        const CONCURRENCY = 5;
        const RATE_PER_MINUTE = 60;
        const MAX_RETRY = 5;
        const RETRY_BASE_DELAY = 1000;

        const rateLimiter = createRateLimiter({
            limitPerInterval: RATE_PER_MINUTE,
            intervalMs: 60_000
        });

        /**
         *
         * @param offset
         */
        async function fetchPage(offset) {
            const result = await executeWithBackoff(
                async () => {
                    const { json } = await friendRequest.getFriends({
                        ...args,
                        n: PAGE_SIZE,
                        offset
                    });
                    return Array.isArray(json) ? json : [];
                },
                {
                    maxRetries: MAX_RETRY,
                    baseDelay: RETRY_BASE_DELAY,
                    shouldRetry: (err) =>
                        err?.status === 429 ||
                        (err?.message || '').includes('429')
                }
            );
            return result;
        }

        let nextOffset = 0;
        let stopFlag = false;
        const friends = [];

        /**
         *
         */
        function getNextOffset() {
            if (stopFlag) return null;
            const cur = nextOffset;
            nextOffset += PAGE_SIZE;
            if (cur > MAX_OFFSET) return null;
            return cur;
        }

        /**
         *
         */
        async function worker() {
            while (true) {
                const offset = getNextOffset();
                if (offset === null) break;

                await rateLimiter.wait();

                const page = await fetchPage(offset);
                if (page.length === 0) {
                    stopFlag = true;
                    break;
                }
                friends.push(...page);
            }
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

        return friends;
    }

    /**
     * @param {Array} friendsArray
     * @returns {Promise<*>}
     */
    async function refetchBrokenFriends(friendsArray) {
        // attempt to fix broken data from bulk friend fetch
        for (let i = 0; i < friendsArray.length; i++) {
            const friend = friendsArray[i];
            try {
                // we don't update friend state here, it's not reliable
                let state_input = 'offline';
                if (friend.platform === 'web') {
                    state_input = 'active';
                } else if (friend.platform) {
                    state_input = 'online';
                }
                const ref = friends.get(friend.id);
                if (ref?.state !== state_input) {
                    if (AppDebug.debugFriendState) {
                        console.log(
                            `Refetching friend state it does not match ${friend.displayName} from ${ref?.state} to ${state_input}`,
                            friend
                        );
                    }
                    const args = await userRequest.getUser({
                        userId: friend.id
                    });
                    friendsArray[i] = args.json;
                } else if (friend.location === 'traveling') {
                    if (AppDebug.debugFriendState) {
                        console.log(
                            'Refetching traveling friend',
                            friend.displayName
                        );
                    }
                    const args = await userRequest.getUser({
                        userId: friend.id
                    });
                    friendsArray[i] = args.json;
                }
            } catch (err) {
                console.error(err);
            }
        }
        return friendsArray;
    }

    /**
     * @param {Array} friends
     * @returns {Promise<*>}
     */
    async function refreshRemainingFriends(friends) {
        const friendsSet = new Set(friends.map((x) => x.id));
        for (const userId of userStore.currentUser.friends) {
            if (!friendsSet.has(userId)) {
                try {
                    if (!watchState.isLoggedIn) {
                        console.error(`User isn't logged in`);
                        return friends;
                    }
                    console.log('Fetching remaining friend', userId);
                    const args = await userRequest.getUser({ userId });
                    friends.push(args.json);
                } catch (err) {
                    console.error(err);
                }
            }
        }
        return friends;
    }

    /**
     * @returns {Promise<void>}
     */
    /**
     *
     * @param forceUpdate
     */
    function updateOnlineFriendCounter(forceUpdate = false) {
        const onlineFriendCounts =
            vipFriends.value.length + onlineFriends.value.length;
        if (onlineFriendCounts !== onlineFriendCount.value || forceUpdate) {
            AppApi.ExecuteVrOverlayFunction(
                'updateOnlineFriendCount',
                `${onlineFriendCounts}`
            );
            onlineFriendCount.value = onlineFriendCounts;
        }
    }

    /**
     *
     */
    async function getAllUserStats() {
        let ref;
        let item;
        const userIds = [];
        const displayNames = [];
        const providerHints = {};
        for (const ctx of friends.values()) {
            userIds.push(ctx.id);
            if (ctx.provider) {
                providerHints[ctx.id] = ctx.provider;
            }
            if (ctx.ref?.displayName) {
                displayNames.push(ctx.ref.displayName);
            }
        }
        if (!userIds.length) {
            return;
        }

        const requestId = ++allUserStatsRequestId;

        const data = await database.getAllUserStats(
            userIds,
            displayNames,
            providerHints
        );
        if (requestId !== allUserStatsRequestId) {
            return;
        }

        const dataByDisplayName = new Map();
        const friendsByDisplayName = new Map();

        for (const ref of data) {
            if (ref.displayName && ref.userId) {
                dataByDisplayName.set(ref.displayName, ref.userId);
            }
        }

        for (const ref of friends.values()) {
            if (ref?.ref?.id && ref.ref.displayName) {
                friendsByDisplayName.set(ref.ref.displayName, ref.id);
            }
        }

        const friendListMap = new Map();
        for (item of data) {
            if (!item.userId) {
                // find userId from previous data with matching displayName
                item.userId = dataByDisplayName.get(item.displayName);

                // if still no userId, find userId from friends list
                if (!item.userId) {
                    item.userId = friendsByDisplayName.get(item.displayName);
                }

                // if still no userId, skip
                if (!item.userId) {
                    continue;
                }
            }

            const friend = friendListMap.get(item.userId);
            if (!friend) {
                friendListMap.set(item.userId, item);
                continue;
            }
            if (Date.parse(item.lastSeen) > Date.parse(friend.lastSeen)) {
                friend.lastSeen = item.lastSeen;
            }
            friend.timeSpent += item.timeSpent;
            friend.joinCount += item.joinCount;
            friend.displayName = item.displayName;
            friendListMap.set(item.userId, friend);
        }
        runInSortedFriendsBatch(() => {
            for (item of friendListMap.values()) {
                ref = friends.get(item.userId);
                if (ref?.ref) {
                    ref.ref.$joinCount = item.joinCount;
                    ref.ref.$lastSeen = item.lastSeen;
                    ref.ref.$timeSpent = item.timeSpent;
                    reindexSortedFriend(ref);
                }
            }
        });
    }

    /**
     *
     */
    async function getAllUserMutualCount() {
        if (!friends.size) {
            return;
        }
        const requestId = ++allUserMutualCountRequestId;
        const mutualCountMap = await database.getMutualCountForAllUsers();
        if (requestId !== allUserMutualCountRequestId) {
            return;
        }
        runInSortedFriendsBatch(() => {
            for (const ctx of friends.values()) {
                if (ctx?.ref && isVrchatMutualEligibleFriend(ctx)) {
                    ctx.ref.$mutualCount = 0;
                } else if (ctx?.ref) {
                    ctx.ref.$mutualCount = 0;
                }
            }
            for (const [userId, mutualCount] of mutualCountMap.entries()) {
                const ref = friends.get(userId);
                if (ref?.ref && isVrchatMutualEligibleFriend(ref)) {
                    ref.ref.$mutualCount = mutualCount;
                    reindexSortedFriend(ref);
                }
            }
        });
    }

    /**
     *
     */
    async function getAllUserMutualOptedOut() {
        if (!friends.size) {
            return;
        }
        const requestId = ++allUserMutualOptedOutRequestId;
        const metaMap = await database.getMutualGraphMeta();
        if (requestId !== allUserMutualOptedOutRequestId) {
            return;
        }
        runInSortedFriendsBatch(() => {
            for (const ctx of friends.values()) {
                if (ctx?.ref && isVrchatMutualEligibleFriend(ctx)) {
                    ctx.ref.$mutualOptedOut = false;
                } else if (ctx?.ref) {
                    ctx.ref.$mutualOptedOut = false;
                }
            }
            for (const [userId, meta] of metaMap.entries()) {
                const ref = friends.get(userId);
                if (ref?.ref && isVrchatMutualEligibleFriend(ref)) {
                    ref.ref.$mutualOptedOut = Boolean(meta.optedOut);
                }
            }
        });
    }

    /**
     *
     * @param {string} id
     */

    /**
     *
     * @param {object} ref
     */

    /**
     *
     * @param {object} currentUser
     * @returns {Promise<void>}
     */
    async function initFriendLog(currentUser) {
        refreshFriendsStatus(currentUser);
        const sqlValues = [];
        const friends = await refreshFriends();
        runInSortedFriendsBatch(() => {
            for (const friend of friends) {
                const ref = applyUser(friend);
                const row = {
                    userId: ref.id,
                    displayName: ref.displayName,
                    trustLevel: ref.$trustLevel,
                    friendNumber: 0
                };
                friendLog.set(friend.id, row);
                sqlValues.unshift(row);
            }
        });
        database.setFriendLogCurrentArray(sqlValues);
        await configRepository.setBool(`friendLogInit_${currentUser.id}`, true);
        watchState.isFriendsLoaded = true;
    }

    /**
     *
     * @param {string} userId
     * @returns {Promise<void>}
     */
    async function migrateFriendLog(userId) {
        VRCXStorage.Remove(`${userId}_friendLogUpdatedAt`);
        VRCXStorage.Remove(`${userId}_friendLog`);
        friendLogTable.value.data = await VRCXStorage.GetArray(
            `${userId}_friendLogTable`
        );
        database.addFriendLogHistoryArray(friendLogTable.value.data);
        VRCXStorage.Remove(`${userId}_friendLogTable`);
        await configRepository.setBool(`friendLogInit_${userId}`, true);
    }

    /**
     *
     * @param {object} currentUser
     * @returns {Promise<void>}
     */
    async function getFriendLog(currentUser) {
        let friend;
        state.friendNumber = await configRepository.getInt(
            `VRCX_friendNumber_${currentUser.id}`,
            0
        );
        const maxFriendLogNumber = await database.getMaxFriendLogNumber();
        if (state.friendNumber < maxFriendLogNumber) {
            state.friendNumber = maxFriendLogNumber;
        }

        const friendLogCurrentArray = await database.getFriendLogCurrent();
        for (friend of friendLogCurrentArray) {
            friendLog.set(friend.userId, friend);
        }
        refreshFriendsStatus(currentUser);

        await refreshFriends();
        watchState.isFriendsLoaded = true;

        // check for friend/name/rank change AFTER isFriendsLoaded is set
        for (friend of friendLogCurrentArray) {
            const ref = userStore.cachedUsers.get(friend.userId);
            if (typeof ref !== 'undefined') {
                updateFriendship(ref);
            }
        }
        if (typeof currentUser.friends !== 'undefined') {
            runUpdateFriendshipsFlow(currentUser);
        }
    }

    /**
     *
     */
    async function initFriendLogHistoryTable() {
        friendLogTable.value.loading = true;
        friendLogTable.value.data = await database.getFriendLogHistory();
        friendLogTable.value.loading = false;
    }

    /**
     * @returns void
     * @param {number} friendNumber
     * @param {string} userId
     */
    function setFriendNumber(friendNumber, userId) {
        const ref = friendLog.get(userId);
        if (!ref) {
            return;
        }
        ref.friendNumber = friendNumber;
        friendLog.set(ref.userId, ref);
        database.setFriendLogCurrent(ref);
        const friendRef = friends.get(userId);
        if (friendRef?.ref) {
            friendRef.ref.$friendNumber = friendNumber;
            reindexSortedFriend(friendRef);
        }
    }

    /**
     *
     */
    async function tryApplyFriendOrder() {
        const lastUpdate = await configRepository.getString(
            `VRCX_lastStoreTime_${userStore.currentUser.id}`
        );
        if (lastUpdate === '-5') {
            // this means we're done
            return;
        }

        // reset friendNumber and friendLog
        state.friendNumber = 0;
        for (const ref of friendLog.values()) {
            ref.friendNumber = 0;
        }

        const friendOrder = userStore.currentUser.friends;
        runInSortedFriendsBatch(() => {
            for (let i = 0; i < friendOrder.length; i++) {
                const userId = friendOrder[i];
                state.friendNumber++;
                setFriendNumber(state.friendNumber, userId);
            }
        });
        if (state.friendNumber === 0) {
            state.friendNumber = friends.size;
        }
        console.log('Applied friend order from API', state.friendNumber);
        await configRepository.setInt(
            `VRCX_friendNumber_${userStore.currentUser.id}`,
            state.friendNumber
        );
        await configRepository.setString(
            `VRCX_lastStoreTime_${userStore.currentUser.id}`,
            '-5'
        );
    }

    /**
     * @deprecated We might need this again one day
     */
    async function tryRestoreFriendNumber() {
        const lastUpdate = await configRepository.getString(
            `VRCX_lastStoreTime_${userStore.currentUser.id}`
        );
        if (lastUpdate === '-4') {
            // this means the backup was already applied
            return;
        }
        var status = false;
        state.friendNumber = 0;
        for (const ref of friendLog.values()) {
            ref.friendNumber = 0;
        }
        try {
            if (lastUpdate) {
                // backup ready to try apply
                status = await restoreFriendNumber();
            }
            // needs to be in reverse because we don't know the starting number
            applyFriendLogFriendOrderInReverse();
        } catch (err) {
            console.error(err);
        }
        // if (status) {
        //     this.$message({
        //         message: 'Friend order restored from backup',
        //         type: 'success',
        //         duration: 0,
        //         showClose: true
        //     });
        // } else if (this.friendLogTable.data.length > 0) {
        //     this.$message({
        //         message:
        //             'No backup found, friend order partially restored from friendLog',
        //         type: 'success',
        //         duration: 0,
        //         showClose: true
        //     });
        // }
        await configRepository.setString(
            `VRCX_lastStoreTime_${userStore.currentUser.id}`,
            '-4'
        );
    }

    /**
     *
     */
    async function restoreFriendNumber() {
        let message;
        let storedData = null;
        try {
            const data = await configRepository.getString(
                `VRCX_friendOrder_${userStore.currentUser.id}`
            );
            if (data) {
                storedData = JSON.parse(data);
            }
        } catch (err) {
            console.error(err);
        }
        if (!storedData || storedData.length === 0) {
            message = 'whomp whomp, no friend order backup found';
            console.error(message);
            return false;
        }

        const friendLogTable = getFriendLogFriendOrder();

        // for storedData
        const machList = [];
        for (let i = 0; i < Object.keys(storedData).length; i++) {
            const key = Object.keys(storedData)[i];
            const value = storedData[key];
            const item = parseFriendOrderBackup(friendLogTable, key, value);
            machList.push(item);
        }
        machList.sort((a, b) => b.matches - a.matches);
        console.log(
            `friendLog: ${friendLogTable.length} friendOrderBackups:`,
            machList
        );

        const bestBackup = machList[0];
        if (!bestBackup?.isValid) {
            message = 'whomp whomp, no valid backup found';
            console.error(message);
            return false;
        }

        applyFriendOrderBackup(bestBackup.table);
        applyFriendLogFriendOrder();
        await configRepository.setInt(
            `VRCX_friendNumber_${userStore.currentUser.id}`,
            state.friendNumber
        );
        return true;
    }

    /**
     *
     */
    function applyFriendLogFriendOrderInReverse() {
        state.friendNumber = friends.size + 1;
        const friendLogTable = getFriendLogFriendOrder();
        for (let i = friendLogTable.length - 1; i > -1; i--) {
            const friendLogEntry = friendLogTable[i];
            const ref = friendLog.get(friendLogEntry.id);
            if (!ref) {
                continue;
            }
            if (ref.friendNumber) {
                break;
            }
            ref.friendNumber = --state.friendNumber;
            friendLog.set(ref.userId, ref);
            database.setFriendLogCurrent(ref);
            const friendRef = friends.get(friendLogEntry.id);
            if (friendRef?.ref) {
                friendRef.ref.$friendNumber = ref.friendNumber;
            }
        }
        state.friendNumber = friends.size;
        console.log('Applied friend order from friendLog');
    }

    /**
     *
     */
    function getFriendLogFriendOrder() {
        const result = [];
        for (let i = 0; i < friendLogTable.value.data.length; i++) {
            const ref = friendLogTable.value.data[i];
            if (ref.type !== 'Friend') {
                continue;
            }
            if (result.findIndex((x) => x.id === ref.userId) !== -1) {
                // console.log(
                //     'ignoring duplicate friend',
                //     ref.displayName,
                //     ref.created_at
                // );
                continue;
            }
            result.push({
                id: ref.userId,
                displayName: ref.displayName,
                created_at: ref.created_at
            });
        }
        result.sort(compareByCreatedAtAscending);
        return result;
    }

    /**
     *
     * @param friendLogTable
     * @param created_at
     * @param backupUserIds
     */
    function parseFriendOrderBackup(friendLogTable, created_at, backupUserIds) {
        let i;
        const backupTable = [];
        for (i = 0; i < backupUserIds.length; i++) {
            const userId = backupUserIds[i];
            const ctx = friends.get(userId);
            if (ctx) {
                backupTable.push({
                    id: ctx.id,
                    displayName: ctx.name
                });
            }
        }

        // var compareTable = [];
        // compare 2 tables, find max amount of id's in same order
        let maxMatches = 0;
        let currentMatches = 0;
        let backupIndex = 0;
        for (i = 0; i < friendLogTable.length; i++) {
            var isMatch = false;
            const ref = friendLogTable[i];
            if (backupIndex <= 0) {
                backupIndex = backupTable.findIndex((x) => x.id === ref.id);
                if (backupIndex !== -1) {
                    currentMatches = 1;
                }
            } else if (backupTable[backupIndex].id === ref.id) {
                currentMatches++;
                isMatch = true;
            } else {
                backupIndex = backupTable.findIndex((x) => x.id === ref.id);
                if (backupIndex !== -1) {
                    currentMatches = 1;
                }
            }
            if (backupIndex === backupTable.length - 1) {
                backupIndex = 0;
            } else {
                backupIndex++;
            }
            if (currentMatches > maxMatches) {
                maxMatches = currentMatches;
            }
            // compareTable.push({
            //     id: ref.id,
            //     displayName: ref.displayName,
            //     match: isMatch
            // });
        }

        const lerp = (a, b, alpha) => {
            return a + alpha * (b - a);
        };
        return {
            matches: parseFloat(`${maxMatches}.${created_at}`),
            table: backupUserIds,
            isValid: maxMatches > lerp(4, 10, backupTable.length / 1000) // pls no collisions
        };
    }

    /**
     *
     * @param userIdOrder
     */
    function applyFriendOrderBackup(userIdOrder) {
        for (let i = 0; i < userIdOrder.length; i++) {
            const userId = userIdOrder[i];
            const ctx = friends.get(userId);
            const ref = ctx?.ref;
            if (!ref || ref.$friendNumber) {
                continue;
            }
            const friendLogCurrent = {
                userId,
                displayName: ref.displayName,
                trustLevel: ref.$trustLevel,
                friendNumber: i + 1
            };
            friendLog.set(userId, friendLogCurrent);
            database.setFriendLogCurrent(friendLogCurrent);
            state.friendNumber = i + 1;
        }
    }

    /**
     *
     */
    function applyFriendLogFriendOrder() {
        const friendLogTable = getFriendLogFriendOrder();
        if (state.friendNumber === 0) {
            console.log('No backup applied, applying friend log in reverse');
            // this means no FriendOrderBackup was applied
            // will need to apply in reverse order instead
            return;
        }
        for (const friendLogEntry of friendLogTable) {
            const ref = friendLog.get(friendLogEntry.id);
            if (!ref || ref.friendNumber) {
                continue;
            }
            ref.friendNumber = ++state.friendNumber;
            friendLog.set(ref.userId, ref);
            database.setFriendLogCurrent(ref);
            const friendRef = friends.get(friendLogEntry.id);
            if (friendRef?.ref) {
                friendRef.ref.$friendNumber = ref.friendNumber;
            }
        }
    }

    /**
     *
     * @param id
     */

    /**
     * Clears all entries in friendLog.
     * Uses .clear() instead of reassignment to keep the same Map reference,
     * so that coordinators reading friendStore.friendLog stay in sync.
     */
    function resetFriendLog() {
        friendLog.clear();
    }

    /**
     * @param {boolean} value
     */
    function setIsRefreshFriendsLoading(value) {
        isRefreshFriendsLoading.value = value;
    }

    async function hydratePersistedResoniteState() {
        const currentUserId = String(userStore.currentUser?.id || '').trim();
        if (!currentUserId || !advancedSettingsStore.resoniteIntegration) {
            return false;
        }

        lastResonitePersistenceUserId = currentUserId;

        try {
            await hydratePersistedResoniteRealtimeState(
                getResonitePersistenceScopeKey(currentUserId)
            );

            const persistedSnapshot = await loadPersistedResoniteSnapshot();
            const snapshot = mergeResoniteRealtimePresence(persistedSnapshot);

            if (snapshot.length === 0) {
                return false;
            }

            lastResoniteFriendsSnapshot.value = snapshot;
            const selfContactId =
                await applyResonitePresenceToCurrentUser(snapshot);
            const currentResoniteIds = new Set();

            runInSortedFriendsBatch(() => {
                for (const persistedEntry of persistedSnapshot) {
                    const friendId = String(persistedEntry?.id || '');
                    if (!friendId) {
                        continue;
                    }

                    if (
                        friendId === selfContactId ||
                        isResoniteSystemContact(persistedEntry) ||
                        friends.has(friendId)
                    ) {
                        continue;
                    }

                    upsertResoniteFriend(persistedEntry, {
                        emitFeed: false
                    });
                }

                for (const snapshotEntry of snapshot) {
                    const friendId = String(snapshotEntry?.id || '');
                    if (!friendId) {
                        continue;
                    }

                    if (
                        friendId === selfContactId ||
                        isResoniteSystemContact(snapshotEntry)
                    ) {
                        continue;
                    }

                    currentResoniteIds.add(friendId);
                    upsertResoniteFriend(snapshotEntry);
                }

                removeStaleResoniteFriends(currentResoniteIds);
            });

            return true;
        } catch (error) {
            console.warn(
                '[ResoniteIntegration] Failed to hydrate persisted Resonite state:',
                error
            );
            return false;
        }
    }

    async function clearResoniteState({
        clearPersisted = false,
        stopRealtime = false
    } = {}) {
        const currentUserId = String(userStore.currentUser?.id || '').trim();
        const persistenceUserId =
            currentUserId || String(lastResonitePersistenceUserId || '').trim();
        const persistenceScopeKey =
            getResonitePersistenceScopeKey(persistenceUserId);

        if (persistResoniteSnapshotTimer) {
            clearTimeout(persistResoniteSnapshotTimer);
            persistResoniteSnapshotTimer = null;
        }

        lastResoniteFriendsSnapshot.value = [];
        if (userStore.currentUser) {
            userStore.currentUser['$resonitePresence'] = null;
        }
        resoniteSelfFeedSnapshot = null;

        const friendIdsToRemove = [];
        for (const [friendId, friendCtx] of friends) {
            if (
                friendCtx?.provider === 'resonite' ||
                String(friendId).startsWith('resonite:')
            ) {
                friendIdsToRemove.push(friendId);
            }
        }

        for (const friendId of friendIdsToRemove) {
            friends.delete(friendId);
            localFavoriteFriends.delete(friendId);
        }

        if (friendIdsToRemove.length > 0) {
            rebuildSortedFriends();
        }

        try {
            if (stopRealtime) {
                await stopResoniteRealtimePresence();
            }

            if (clearPersisted && persistenceScopeKey) {
                await clearResoniteRealtimeState(persistenceScopeKey);
            }
        } catch (error) {
            console.warn(
                '[ResoniteIntegration] Failed to clear realtime state:',
                error
            );
        }

        if (clearPersisted && persistenceUserId) {
            try {
                await database.clearResoniteCache();
            } catch (error) {
                console.warn(
                    '[ResoniteIntegration] Failed to clear persisted Resonite snapshot:',
                    error
                );
            }
        }

        if (persistenceUserId) {
            lastResonitePersistenceUserId = persistenceUserId;
        }

        return friendIdsToRemove.length;
    }

    function schedulePersistResoniteState(
        snapshot = lastResoniteFriendsSnapshot.value
    ) {
        const currentUserId = String(userStore.currentUser?.id || '').trim();
        if (!currentUserId) {
            return;
        }

        if (persistResoniteSnapshotTimer) {
            clearTimeout(persistResoniteSnapshotTimer);
        }

        persistResoniteSnapshotTimer = setTimeout(() => {
            persistResoniteSnapshotTimer = null;
            void persistResoniteSnapshotCache(snapshot, currentUserId).catch(
                (error) => {
                    console.warn(
                        '[ResoniteIntegration] Failed to persist Resonite snapshot:',
                        error
                    );
                }
            );
        }, 500);
    }

    /** @returns {Promise<Object[]>} */
    async function refreshResoniteFriends() {
        try {
            lastResonitePersistenceUserId = String(
                userStore.currentUser?.id || ''
            ).trim();

            const persistenceScopeKey = getResonitePersistenceScopeKey(
                userStore.currentUser?.id
            );
            const refreshAttemptedAt = Date.now();

            if (persistenceScopeKey) {
                await recordResoniteSnapshotRefreshState({
                    scope: persistenceScopeKey,
                    phase: 'attempt',
                    lastAttemptAt: refreshAttemptedAt
                });
            }

            const fetchResult = await fetchResoniteFriends();
            const fetchSucceeded =
                Array.isArray(fetchResult) ||
                (fetchResult?.success === true &&
                    Array.isArray(fetchResult?.friends));
            const resoniteFriendsList = Array.isArray(fetchResult)
                ? fetchResult
                : Array.isArray(fetchResult?.friends)
                  ? fetchResult.friends
                  : [];

            if (!fetchSucceeded) {
                await recordResoniteSnapshotRefreshState({
                    scope: persistenceScopeKey,
                    phase: 'failure',
                    lastAttemptAt: refreshAttemptedAt,
                    lastErrorText: 'fetch-failed'
                });
                console.warn(
                    '[ResoniteIntegration] Resonite friends refresh failed; preserving existing contacts until a successful snapshot arrives'
                );
                return [];
            }

            if (!Array.isArray(resoniteFriendsList)) {
                await recordResoniteSnapshotRefreshState({
                    scope: persistenceScopeKey,
                    phase: 'failure',
                    lastAttemptAt: refreshAttemptedAt,
                    lastErrorText: 'invalid-friends-payload'
                });
                console.warn(
                    '[ResoniteIntegration] fetchResoniteFriends returned non-array'
                );
                return [];
            }

            if (!advancedSettingsStore.resoniteIntegration) {
                await stopResoniteRealtimePresence();
            }

            const shouldAttemptRealtime =
                advancedSettingsStore.resoniteIntegration &&
                (await shouldAttemptResoniteRealtimeRefresh(
                    persistenceScopeKey,
                    refreshAttemptedAt
                ));

            if (shouldAttemptRealtime) {
                await recordResonitePresenceRefreshState({
                    scope: persistenceScopeKey,
                    phase: 'attempt',
                    lastAttemptAt: refreshAttemptedAt
                });

                const realtimeEnabled = await ensureResoniteRealtimePresence({
                    enabled: advancedSettingsStore.resoniteIntegration,
                    apiKey: advancedSettingsStore.resoniteApiKey,
                    persistenceKey: persistenceScopeKey,
                    contactUserIds: resoniteFriendsList.map((friendData) =>
                        stripResonitePrefix(friendData?.id)
                    )
                });

                if (realtimeEnabled) {
                    await recordResonitePresenceRefreshState({
                        scope: persistenceScopeKey,
                        phase: 'success',
                        lastAttemptAt: refreshAttemptedAt,
                        lastSuccessfulPresenceAt: refreshAttemptedAt
                    });
                } else {
                    await recordResonitePresenceRefreshState({
                        scope: persistenceScopeKey,
                        phase: 'failure',
                        lastAttemptAt: refreshAttemptedAt,
                        lastErrorText: 'realtime-connect-failed'
                    });
                }
            }

            reconcileResoniteRealtimeAgainstSnapshot(resoniteFriendsList);

            const enrichedResoniteFriendsList =
                mergeResoniteRealtimePresence(resoniteFriendsList);
            lastResoniteFriendsSnapshot.value = enrichedResoniteFriendsList;
            schedulePersistResoniteState(enrichedResoniteFriendsList);

            if (advancedSettingsStore.resoniteIntegration) {
                setResoniteRealtimePresenceListener(() => {
                    applyRealtimeResonitePresenceUpdates();
                });
                await applyRealtimeResonitePresenceUpdates();
            }

            const latestResoniteFriendsList = Array.isArray(
                lastResoniteFriendsSnapshot.value
            )
                ? lastResoniteFriendsSnapshot.value
                : enrichedResoniteFriendsList;

            const selfContactId = await applyResonitePresenceToCurrentUser(
                latestResoniteFriendsList
            );

            const currentResoniteIds = new Set();

            for (const friendData of latestResoniteFriendsList) {
                const friendId = String(friendData?.id || '');
                if (!friendId) {
                    continue;
                }

                if (
                    friendId === selfContactId ||
                    isResoniteSystemContact(friendData)
                ) {
                    continue;
                }

                currentResoniteIds.add(friendId);
                upsertResoniteFriend(friendData);
            }

            removeStaleResoniteFriends(currentResoniteIds);

            await recordResoniteSnapshotRefreshState({
                scope: persistenceScopeKey,
                phase: 'success',
                lastAttemptAt: refreshAttemptedAt,
                lastSuccessfulSnapshotAt: Date.now(),
                lastErrorText: ''
            });

            return latestResoniteFriendsList;
        } catch (error) {
            await recordResoniteSnapshotRefreshState({
                scope: getResonitePersistenceScopeKey(
                    userStore.currentUser?.id
                ),
                phase: 'failure',
                lastAttemptAt: Date.now(),
                lastErrorText:
                    error?.message || String(error || 'unknown-error')
            });
            console.error(
                '[ResoniteIntegration] Error refreshing Resonite friends:',
                error
            );
            return [];
        }
    }

    async function applyRealtimeResonitePresenceUpdates() {
        const snapshot = lastResoniteFriendsSnapshot.value;
        if (!Array.isArray(snapshot) || snapshot.length === 0) {
            return;
        }

        try {
            const enrichedResoniteFriendsList =
                mergeResoniteRealtimePresence(snapshot);
            lastResoniteFriendsSnapshot.value = enrichedResoniteFriendsList;
            schedulePersistResoniteState(enrichedResoniteFriendsList);

            const selfContactId = await applyResonitePresenceToCurrentUser(
                enrichedResoniteFriendsList
            );

            const currentResoniteIds = new Set();

            runInSortedFriendsBatch(() => {
                for (const friendData of enrichedResoniteFriendsList) {
                    const friendId = String(friendData?.id || '');
                    if (!friendId) {
                        continue;
                    }

                    if (
                        friendId === selfContactId ||
                        isResoniteSystemContact(friendData)
                    ) {
                        continue;
                    }

                    currentResoniteIds.add(friendId);
                    upsertResoniteFriend(friendData);
                }

                removeStaleResoniteFriends(currentResoniteIds);
            });
        } catch (error) {
            console.warn(
                '[ResoniteIntegration] Failed to apply realtime presence update to store:',
                error
            );
        }
    }

    async function applyResonitePresenceToCurrentUser(resoniteFriendsList) {
        const currentUser = userStore.currentUser;
        if (!currentUser?.id) {
            return '';
        }

        const savedUsername = await getSavedResoniteUsername();
        const apiKeyUserId = parseResoniteUserIdFromApiKey(
            advancedSettingsStore.resoniteApiKey
        );

        console.debug('[ResoniteIntegration] findResoniteSelfContact lookup:', {
            savedUsername,
            apiKeyUserId,
            totalFriends: resoniteFriendsList?.length ?? 0,
            friendIds: (resoniteFriendsList || []).map((f) => f?.id)
        });

        const selfContact = findResoniteSelfContact(resoniteFriendsList, {
            username: savedUsername,
            userId: apiKeyUserId
        });

        if (!selfContact) {
            console.warn(
                '[ResoniteIntegration] No self-contact found in friends list. $resonitePresence will be null.'
            );
            clearCurrentUserResonitePresence(currentUser);
            return '';
        }

        persistResoniteSelfPresenceFeedEntries(selfContact);
        const resonitePresencePayload =
            buildResoniteCurrentUserPresence(selfContact);
        currentUser['$resonitePresence'] = resonitePresencePayload;

        logAppliedResoniteCurrentUserPresence(
            selfContact,
            resonitePresencePayload
        );

        return String(selfContact?.id || '');
    }

    function clearCurrentUserResonitePresence(currentUser) {
        currentUser['$resonitePresence'] = null;
        resoniteSelfFeedSnapshot = null;
    }

    function getResonitePresenceLocationName(selfContact) {
        const rawLocationName = firstNonEmptyString(
            selfContact?.ref?.traveling,
            selfContact?.ref?.location,
            selfContact?.resonite?.locationName
        );

        return selfContact?.state === 'online' && rawLocationName === 'offline'
            ? ''
            : rawLocationName;
    }

    function buildResoniteCurrentUserPresence(selfContact) {
        const locationName = getResonitePresenceLocationName(selfContact);

        return {
            isActive: true,
            source: 'resonite',
            linkedContactId: String(selfContact?.id || '').trim(),
            linkedUserId:
                selfContact?.resonite?.userId ||
                stripResonitePrefix(selfContact?.id),
            linkedDisplayName: firstNonEmptyString(
                selfContact?.name,
                selfContact?.ref?.displayName
            ),
            status: mapResoniteStatusToVrchatStatus(
                selfContact?.ref?.status,
                selfContact?.state
            ),
            state: selfContact?.state || 'offline',
            statusDescription: firstNonEmptyString(
                selfContact?.ref?.statusDescription,
                selfContact?.resonite?.profile?.tagline,
                selfContact?.resonite?.profile?.description
            ),
            avatarUrl: firstNonEmptyString(
                selfContact?.ref?.profileImageUrl,
                selfContact?.ref?.userIcon,
                selfContact?.resonite?.profile?.iconUrl
            ),
            locationName,
            currentSessionName: firstNonEmptyString(
                selfContact?.resonite?.currentSessionName,
                locationName
            ),
            currentSessionHash: String(
                selfContact?.resonite?.currentSessionHash || ''
            ).trim(),
            outputDevice: firstNonEmptyString(
                selfContact?.resonite?.realtime?.outputDevice,
                selfContact?.resonite?.outputDevice
            ),
            appVersion: firstNonEmptyString(
                selfContact?.resonite?.realtime?.appVersion,
                selfContact?.resonite?.appVersion
            )
        };
    }

    function logAppliedResoniteCurrentUserPresence(
        selfContact,
        resonitePresencePayload
    ) {
        console.debug(
            '[ResoniteIntegration] $resonitePresence applied to currentUser:',
            JSON.stringify(resonitePresencePayload, null, 2)
        );
        console.debug(
            '[ResoniteIntegration] selfContact snapshot:',
            JSON.stringify(
                {
                    id: selfContact?.id,
                    name: selfContact?.name,
                    state: selfContact?.state,
                    refStatus: selfContact?.ref?.status,
                    refLocation: selfContact?.ref?.location,
                    refStatusDescription: selfContact?.ref?.statusDescription,
                    refProfileImageUrl: selfContact?.ref?.profileImageUrl,
                    resoniteAppVersion: selfContact?.resonite?.appVersion,
                    resoniteLocationName: selfContact?.resonite?.locationName,
                    resoniteOnlineStatus: selfContact?.resonite?.onlineStatus
                },
                null,
                2
            )
        );
    }

    function buildResoniteSelfFeedSnapshot(selfContact) {
        const contactId = String(selfContact?.id || '').trim();
        if (!contactId) {
            return null;
        }

        const state =
            String(selfContact?.state || 'offline').trim() || 'offline';
        const rawLocation = firstNonEmptyString(
            selfContact?.ref?.traveling,
            selfContact?.ref?.location,
            selfContact?.resonite?.locationName,
            selfContact?.resonite?.currentSessionName
        );
        const locationName =
            state === 'online' && rawLocation === 'offline' ? '' : rawLocation;

        return {
            id: contactId,
            name: firstNonEmptyString(
                selfContact?.name,
                selfContact?.ref?.displayName,
                contactId
            ),
            state,
            provider: 'resonite',
            isExternal: true,
            ref: {
                id: contactId,
                displayName: firstNonEmptyString(
                    selfContact?.ref?.displayName,
                    selfContact?.name,
                    contactId
                ),
                state,
                status: String(selfContact?.ref?.status || '').trim(),
                statusDescription: String(
                    selfContact?.ref?.statusDescription || ''
                ).trim(),
                location:
                    locationName || (state === 'offline' ? 'offline' : ''),
                traveling: locationName || '',
                resonite: {
                    accessLevel: String(
                        selfContact?.resonite?.accessLevel || ''
                    ).trim()
                }
            },
            resonite: {
                userId: firstNonEmptyString(
                    selfContact?.resonite?.userId,
                    stripResonitePrefix(contactId)
                ),
                accessLevel: String(
                    selfContact?.resonite?.accessLevel || ''
                ).trim(),
                locationName,
                currentSessionName: firstNonEmptyString(
                    selfContact?.resonite?.currentSessionName,
                    locationName
                ),
                currentSessionHash: String(
                    selfContact?.resonite?.currentSessionHash || ''
                ).trim()
            }
        };
    }

    function persistResoniteSelfPresenceFeedEntries(selfContact) {
        const nextSnapshot = buildResoniteSelfFeedSnapshot(selfContact);
        if (!nextSnapshot) {
            resoniteSelfFeedSnapshot = null;
            return;
        }

        const { refPatch, feedEntries } = buildResonitePresenceFeedUpdate(
            resoniteSelfFeedSnapshot,
            nextSnapshot
        );
        nextSnapshot.ref = {
            ...nextSnapshot.ref,
            ...refPatch
        };
        resoniteSelfFeedSnapshot = nextSnapshot;

        for (const feedEntry of feedEntries) {
            switch (feedEntry.type) {
                case 'GPS':
                    database.addGPSToDatabase(feedEntry);
                    break;
                case 'Status':
                    database.addStatusToDatabase(feedEntry);
                    break;
                case 'Online':
                case 'Offline':
                    database.addOnlineOfflineToDatabase(feedEntry);
                    break;
            }
        }
    }

    async function getSavedResoniteUsername() {
        try {
            const resoniteCredentialsStore = useResoniteCredentialsStore();
            const savedCredentials =
                await resoniteCredentialsStore.getSavedResoniteCredentialsForCurrentUser();
            return String(savedCredentials?.username || '').trim();
        } catch (error) {
            console.warn(
                '[ResoniteIntegration] Failed to read saved Resonite username for self mapping:',
                error
            );
            return '';
        }
    }

    function findResoniteSelfContact(
        resoniteFriendsList,
        { username = '', userId = '' }
    ) {
        const normalizedUsername = normalizeResoniteHandle(username);
        const normalizedUserId = normalizeResoniteHandle(userId);

        for (const friendData of resoniteFriendsList) {
            const idCandidates = [
                stripResonitePrefix(friendData?.id),
                friendData?.resonite?.userId,
                friendData?.ref?.resonite?.userId
            ];
            const nameCandidates = [
                friendData?.name,
                friendData?.ref?.displayName,
                friendData?.ref?.resonite?.username
            ];

            if (
                normalizedUserId &&
                idCandidates.some(
                    (value) =>
                        normalizeResoniteHandle(value) === normalizedUserId
                )
            ) {
                return friendData;
            }

            if (
                normalizedUsername &&
                nameCandidates.some(
                    (value) =>
                        normalizeResoniteHandle(value) === normalizedUsername
                )
            ) {
                return friendData;
            }
        }

        return null;
    }

    function parseResoniteUserIdFromApiKey(apiKey) {
        const key = String(apiKey || '').trim();
        if (!key) {
            return '';
        }

        const withoutPrefix = key.toLowerCase().startsWith('res ')
            ? key.slice(4).trim()
            : key;
        const separatorIndex = withoutPrefix.indexOf(':');
        if (separatorIndex === -1) {
            return '';
        }

        return withoutPrefix.slice(0, separatorIndex).trim();
    }

    function isResoniteSystemContact(friendData) {
        const id = normalizeResoniteHandle(
            stripResonitePrefix(friendData?.id || friendData?.resonite?.userId)
        );
        const displayName = normalizeResoniteHandle(
            firstNonEmptyString(friendData?.name, friendData?.ref?.displayName)
        );

        return id === 'u-resonite' || displayName === 'resonite';
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

    function getSharedResoniteHistoryUserId() {
        const presence = userStore.currentUser?.$resonitePresence || {};
        const linkedContactId = String(presence.linkedContactId || '').trim();
        if (linkedContactId) {
            return linkedContactId;
        }

        const linkedUserId = String(presence.linkedUserId || '').trim();
        return linkedUserId ? `resonite:${linkedUserId}` : '';
    }

    function mapResoniteStatusToVrchatStatus(status, state) {
        const normalizedStatus = String(status || '')
            .trim()
            .toLowerCase();
        const normalizedState = String(state || '')
            .trim()
            .toLowerCase();

        if (
            normalizedStatus === 'offline' ||
            normalizedStatus === 'invisible' ||
            normalizedState === 'offline'
        ) {
            return '';
        }

        if (normalizedStatus === 'join me') {
            return 'join me';
        }
        if (normalizedStatus === 'ask me') {
            return 'ask me';
        }
        if (normalizedStatus === 'active') {
            return 'active';
        }

        if (normalizedStatus === 'busy') {
            return 'busy';
        }
        if (normalizedStatus === 'sociable') {
            return 'join me';
        }
        if (normalizedStatus === 'away') {
            return 'ask me';
        }
        return 'active';
    }

    function applyResoniteFriendUpdate(
        existingFriend,
        normalizedIncoming,
        { emitFeed = true } = {}
    ) {
        const { refPatch, feedEntries } = buildResonitePresenceFeedUpdate(
            existingFriend,
            normalizedIncoming
        );

        normalizedIncoming.ref = {
            ...normalizedIncoming.ref,
            ...refPatch
        };

        if (emitFeed) {
            emitResonitePresenceFeedEntries(feedEntries);
        }

        if (existingFriend) {
            existingFriend.state = normalizedIncoming.state;
            existingFriend.status = normalizedIncoming.status;
            existingFriend.name = normalizedIncoming.name;
            existingFriend.ref = normalizedIncoming.ref;
            existingFriend.resonite = normalizedIncoming.resonite;
            existingFriend.provider = normalizedIncoming.provider;
            existingFriend.isExternal = normalizedIncoming.isExternal;
            existingFriend.pendingOffline = false;

            syncOpenResoniteUserDialog(existingFriend, {
                refreshStats: feedEntries.length > 0
            });
            reindexSortedFriend(existingFriend);
            return;
        }

        const ctx = reactive({
            id: normalizedIncoming.id,
            state: normalizedIncoming.state || 'offline',
            status: normalizedIncoming.status || '',
            isVIP: false,
            ref: normalizedIncoming.ref,
            name: normalizedIncoming.name,
            memo: '',
            pendingOffline: false,
            provider: 'resonite',
            resonite: normalizedIncoming.resonite,
            isExternal: true,
            $nickName: ''
        });

        friends.set(normalizedIncoming.id, ctx);
        syncOpenResoniteUserDialog(ctx, {
            refreshStats: feedEntries.length > 0
        });
        reindexSortedFriend(ctx);
    }

    function syncOpenResoniteUserDialog(
        friendCtx,
        { refreshStats = false } = {}
    ) {
        const dialog = userStore.userDialog;
        if (!dialog?.visible || !friendCtx?.id) {
            return;
        }

        const dialogUserId = String(dialog.id || dialog.ref?.id || '').trim();
        if (dialogUserId !== String(friendCtx.id).trim()) {
            return;
        }

        const previousLocation = String(dialog.ref?.location || '').trim();
        const avatarUrl = firstNonEmptyString(
            friendCtx?.ref?.profilePicOverrideThumbnail,
            friendCtx?.ref?.profilePicOverride,
            friendCtx?.ref?.profileImageUrl,
            friendCtx?.ref?.userIcon
        );
        const resonite =
            friendCtx?.resonite || friendCtx?.ref?.resonite
                ? {
                      ...(friendCtx?.resonite || {}),
                      ...(friendCtx?.ref?.resonite || {})
                  }
                : undefined;

        Object.assign(dialog.ref, {
            id: String(friendCtx.id || dialog.ref?.id || '').trim(),
            displayName: firstNonEmptyString(
                friendCtx?.ref?.displayName,
                friendCtx?.name,
                dialog.ref?.displayName,
                dialogUserId
            ),
            isFriend: true,
            state: String(friendCtx.state || 'offline').trim() || 'offline',
            status: firstNonEmptyString(
                friendCtx?.ref?.status,
                friendCtx?.status,
                dialog.ref?.status
            ),
            statusDescription: firstNonEmptyString(
                friendCtx?.ref?.statusDescription,
                dialog.ref?.statusDescription
            ),
            location: String(friendCtx?.ref?.location || '').trim(),
            travelingToLocation: String(friendCtx?.ref?.traveling || '').trim(),
            last_activity: firstNonEmptyString(
                friendCtx?.ref?.last_activity,
                dialog.ref?.last_activity
            ),
            last_login: firstNonEmptyString(
                friendCtx?.ref?.last_login,
                dialog.ref?.last_login
            ),
            currentAvatarImageUrl: avatarUrl,
            currentAvatarThumbnailImageUrl: avatarUrl,
            userIcon: avatarUrl,
            profilePicOverrideThumbnail: '',
            profilePicOverride: '',
            $location_at: Number(
                friendCtx?.ref?.$location_at || dialog.ref?.$location_at || 0
            ),
            $online_for: friendCtx?.ref?.$online_for || '',
            $travelingToTime: Number(
                friendCtx?.ref?.$travelingToTime ||
                    dialog.ref?.$travelingToTime ||
                    0
            ),
            $offline_for:
                friendCtx?.ref?.$offline_for || dialog.ref?.$offline_for,
            $active_for: friendCtx?.ref?.$active_for || dialog.ref?.$active_for,
            $previousLocation: firstNonEmptyString(
                friendCtx?.ref?.$previousLocation,
                dialog.ref?.$previousLocation
            ),
            resonite
        });

        dialog.friend = friendCtx;
        dialog.isFriend = true;

        if (String(dialog.ref?.location || '').trim() !== previousLocation) {
            userStore.applyUserDialogLocation(true);
        }

        if (!refreshStats) {
            return;
        }

        const requestUserId = dialogUserId;
        const sharedWithResoniteUserId = getSharedResoniteHistoryUserId();
        const statsRef = {
            ...dialog.ref,
            sharedOnly: Boolean(sharedWithResoniteUserId),
            sharedWithUserId: sharedWithResoniteUserId
        };
        void database.getUserStats(statsRef, false).then((stats) => {
            if (userStore.userDialog.id !== requestUserId) {
                return;
            }

            userStore.userDialog.lastSeen = stats.lastSeen;
            userStore.userDialog.joinCount = stats.joinCount;
            userStore.userDialog.timeSpent = stats.timeSpent;
        });
    }

    function queuePendingResoniteOffline(friendId, normalizedIncoming) {
        const existingFriend = friends.get(friendId);
        if (!existingFriend) {
            return;
        }

        const existingPending = pendingOfflineMap.get(friendId);
        if (existingPending) {
            existingPending.payload = normalizedIncoming;
            existingPending.newState = normalizedIncoming.state || 'offline';
            return;
        }

        existingFriend.pendingOffline = true;
        pendingOfflineMap.set(friendId, {
            startTime: Date.now(),
            newState: normalizedIncoming.state || 'offline',
            payload: normalizedIncoming,
            previousLocation: existingFriend.ref?.location || 'offline',
            previousLocationAt: existingFriend.ref?.$location_at
        });
        reindexSortedFriend(existingFriend);
    }

    function flushPendingResoniteOffline(friendId) {
        const existingPending = pendingOfflineMap.get(friendId);
        if (!existingPending) {
            return;
        }

        pendingOfflineMap.delete(friendId);
        const existingFriend = friends.get(friendId);
        if (existingFriend) {
            existingFriend.pendingOffline = false;
            reindexSortedFriend(existingFriend);
        }
    }

    function commitPendingResoniteUpdate(friendId, normalizedIncoming) {
        flushPendingResoniteOffline(friendId);
        applyResoniteFriendUpdate(friends.get(friendId), normalizedIncoming);
    }

    function emitResonitePresenceFeedEntries(feedEntries) {
        if (!Array.isArray(feedEntries) || feedEntries.length === 0) {
            return;
        }

        for (const feedEntry of feedEntries) {
            notificationStore.queueFeedNoty(feedEntry);
            sharedFeedStore.addEntry(feedEntry);
            feedStore.addFeedEntry(feedEntry);

            switch (feedEntry.type) {
                case 'GPS':
                    database.addGPSToDatabase(feedEntry);
                    break;
                case 'Status':
                    database.addStatusToDatabase(feedEntry);
                    break;
                case 'Online':
                case 'Offline':
                    database.addOnlineOfflineToDatabase(feedEntry);
                    break;
            }
        }
    }

    /** @param {Object} friendData */
    function upsertResoniteFriend(friendData, options = {}) {
        if (!friendData?.id || friendData?.provider !== 'resonite') {
            console.warn(
                '[ResoniteIntegration] Invalid friend data for upsert:',
                friendData
            );
            return;
        }

        const friendId = friendData.id;
        const normalizedIncoming = normalizeResoniteFriendUpdate(
            friendData,
            friends.get(friendId)
        );
        const existingFriend = friends.get(friendId);
        const nextState = String(normalizedIncoming.state || 'offline').trim();
        const incomingPresenceIsAuthoritative =
            normalizedIncoming?.resonite?.hasPresenceSignals !== false;

        if (
            existingFriend?.state === 'online' &&
            nextState === 'offline' &&
            incomingPresenceIsAuthoritative
        ) {
            queuePendingResoniteOffline(friendId, normalizedIncoming);
            return;
        }

        if (nextState === 'online') {
            flushPendingResoniteOffline(friendId);
        }

        applyResoniteFriendUpdate(existingFriend, normalizedIncoming, options);
    }

    /** @param {Set<string>} currentResoniteIds */
    function removeStaleResoniteFriends(currentResoniteIds) {
        const friendIdsToRemove = [];

        for (const [friendId] of friends) {
            if (
                friendId.startsWith('resonite:') &&
                !currentResoniteIds.has(friendId)
            ) {
                friendIdsToRemove.push(friendId);
            }
        }

        for (const friendId of friendIdsToRemove) {
            friends.delete(friendId);
            localFavoriteFriends.delete(friendId);
        }

        if (friendIdsToRemove.length > 0) {
            rebuildSortedFriends();
        }
    }

    /**
     * Merge sparse incoming Resonite payloads with an existing friend entry,
     * preserving live world/session fields only when newer realtime evidence exists.
     *
     * @param {Object} incoming
     * @param {Object|undefined} existingCtx
     * @returns {Object}
     */
    function normalizeResoniteFriendUpdate(incoming, existingCtx) {
        const normalizedIncoming = {
            ...incoming,
            ref: {
                ...(incoming?.ref || {})
            },
            resonite: {
                ...(incoming?.resonite || {})
            }
        };

        normalizedIncoming.ref.resonite = {
            ...(normalizedIncoming.ref.resonite || {}),
            ...(normalizedIncoming.resonite || {})
        };

        if (!existingCtx?.ref) {
            return normalizedIncoming;
        }

        const existingRef = existingCtx.ref;
        const existingResonite = {
            ...(existingRef?.resonite || {}),
            ...(existingCtx?.resonite || {})
        };
        const incomingRef = normalizedIncoming.ref;
        const incomingResonite = normalizedIncoming.resonite;
        const incomingPresenceIsAuthoritative =
            incomingResonite.hasPresenceSignals !== false;
        let mergeTrace = {
            ...(existingResonite.mergeTrace || {}),
            ...(incomingResonite.mergeTrace || {})
        };
        const preferIncomingContactFields =
            shouldPreferIncomingResoniteContactFields(
                existingResonite.contactObservedAt,
                incomingResonite.contactObservedAt
            );
        const existingContactObservedAt = Number(
            existingResonite.contactObservedAt || 0
        );
        const incomingContactObservedAt = Number(
            incomingResonite.contactObservedAt || 0
        );
        const existingRealtimeObservedAt = Number(
            existingResonite.realtime?.updatedAt || 0
        );
        const parsedRealtimeLastPresence = Date.parse(
            String(existingResonite.realtime?.lastPresenceTimestamp || '')
        );
        const parsedRealtimeLastStatusChange = Date.parse(
            String(existingResonite.realtime?.lastStatusChange || '')
        );
        const effectiveExistingRealtimeObservedAt =
            existingRealtimeObservedAt > 0
                ? existingRealtimeObservedAt
                : Number.isFinite(parsedRealtimeLastPresence)
                  ? parsedRealtimeLastPresence
                  : Number.isFinite(parsedRealtimeLastStatusChange)
                    ? parsedRealtimeLastStatusChange
                    : 0;
        const existingHasLiveSessionIdentity = Boolean(
            firstNonEmptyString(
                existingRef.location !== 'offline' ? existingRef.location : '',
                existingRef.traveling,
                existingResonite.locationName,
                existingResonite.currentSessionHash,
                existingResonite.currentSessionName,
                existingResonite.realtime?.currentSessionHash,
                existingResonite.realtime?.currentSessionName
            )
        );
        const realtimeGraceMs = Math.min(
            RESONITE_PRESENCE_MAX_BACKOFF_MS,
            Math.max(
                60_000,
                Math.max(
                    30,
                    Number(advancedSettingsStore.resoniteRefreshSeconds) || 300
                ) *
                    1000 *
                    3
            )
        );
        const hasRepeatedContactsOnlyOfflineEvidence =
            !incomingPresenceIsAuthoritative &&
            existingResonite.hasPresenceSignals === false &&
            existingContactObservedAt > 0 &&
            incomingContactObservedAt > existingContactObservedAt &&
            effectiveExistingRealtimeObservedAt > 0 &&
            existingContactObservedAt > effectiveExistingRealtimeObservedAt;
        const hasFreshExistingRealtimePresence =
            String(existingCtx.state || '').trim() === 'online' &&
            existingHasLiveSessionIdentity &&
            Number.isFinite(effectiveExistingRealtimeObservedAt) &&
            effectiveExistingRealtimeObservedAt > 0 &&
            !hasRepeatedContactsOnlyOfflineEvidence &&
            ((!incomingContactObservedAt &&
                effectiveExistingRealtimeObservedAt >=
                    RESONITE_REALTIME_EPOCH_MS_FLOOR &&
                Date.now() - effectiveExistingRealtimeObservedAt <=
                    realtimeGraceMs) ||
                (incomingContactObservedAt > 0 &&
                    effectiveExistingRealtimeObservedAt >=
                        incomingContactObservedAt) ||
                (incomingContactObservedAt > 0 &&
                    effectiveExistingRealtimeObservedAt >=
                        RESONITE_REALTIME_EPOCH_MS_FLOOR &&
                    Date.now() - effectiveExistingRealtimeObservedAt <=
                        realtimeGraceMs));

        function recordContactMergeTrace(
            field,
            winner,
            reason,
            existingValue,
            incomingValue,
            selectedValue
        ) {
            mergeTrace = upsertResoniteMergeTraceField(
                mergeTrace,
                'contact',
                field,
                {
                    winner,
                    reason,
                    existingObservedAt: existingContactObservedAt,
                    incomingObservedAt: incomingContactObservedAt,
                    existingValue,
                    incomingValue,
                    selectedValue
                }
            );
        }

        function selectContactStringField(field, existingValue, incomingValue) {
            const normalizedExisting = String(existingValue || '').trim();
            const normalizedIncoming = String(incomingValue || '').trim();

            if (!preferIncomingContactFields && normalizedExisting) {
                recordContactMergeTrace(
                    field,
                    'existing',
                    'existing-contact-newer',
                    normalizedExisting,
                    normalizedIncoming,
                    normalizedExisting
                );
                return normalizedExisting;
            }

            if (normalizedIncoming) {
                recordContactMergeTrace(
                    field,
                    'incoming',
                    preferIncomingContactFields
                        ? 'incoming-contact-newer-or-equal'
                        : 'existing-missing',
                    normalizedExisting,
                    normalizedIncoming,
                    normalizedIncoming
                );
                return normalizedIncoming;
            }

            if (normalizedExisting) {
                recordContactMergeTrace(
                    field,
                    'existing',
                    'incoming-missing',
                    normalizedExisting,
                    normalizedIncoming,
                    normalizedExisting
                );
                return normalizedExisting;
            }

            recordContactMergeTrace(
                field,
                'incoming',
                'no-contact-value',
                normalizedExisting,
                normalizedIncoming,
                normalizedIncoming
            );
            return normalizedIncoming;
        }

        function selectContactBooleanField(
            field,
            existingValue,
            incomingValue
        ) {
            const hasExisting = typeof existingValue === 'boolean';
            const hasIncoming = typeof incomingValue === 'boolean';

            if (!preferIncomingContactFields && hasExisting) {
                recordContactMergeTrace(
                    field,
                    'existing',
                    'existing-contact-newer',
                    existingValue,
                    incomingValue,
                    existingValue
                );
                return existingValue;
            }

            if (hasIncoming) {
                recordContactMergeTrace(
                    field,
                    'incoming',
                    preferIncomingContactFields
                        ? 'incoming-contact-newer-or-equal'
                        : 'existing-missing',
                    existingValue,
                    incomingValue,
                    incomingValue
                );
                return incomingValue;
            }

            if (hasExisting) {
                recordContactMergeTrace(
                    field,
                    'existing',
                    'incoming-missing',
                    existingValue,
                    incomingValue,
                    existingValue
                );
                return existingValue;
            }

            recordContactMergeTrace(
                field,
                'incoming',
                'no-contact-value',
                existingValue,
                incomingValue,
                incomingValue
            );
            return incomingValue;
        }

        normalizedIncoming.name = selectContactStringField(
            'name',
            existingCtx.name,
            normalizedIncoming.name
        );
        incomingRef.displayName = selectContactStringField(
            'displayName',
            existingRef.displayName,
            incomingRef.displayName
        );

        const selectedContactStatus = selectContactStringField(
            'contactStatus',
            firstNonEmptyString(
                existingRef.contactStatus,
                existingResonite.contactStatus
            ),
            firstNonEmptyString(
                incomingRef.contactStatus,
                incomingResonite.contactStatus
            )
        );
        incomingRef.contactStatus = selectedContactStatus;
        incomingResonite.contactStatus = selectedContactStatus;

        const selectedLatestMessageTime = selectContactStringField(
            'latestMessageTime',
            firstNonEmptyString(
                existingRef.latestMessageTime,
                existingResonite.latestMessageTime
            ),
            firstNonEmptyString(
                incomingRef.latestMessageTime,
                incomingResonite.latestMessageTime
            )
        );
        incomingRef.latestMessageTime = selectedLatestMessageTime;
        incomingResonite.latestMessageTime = selectedLatestMessageTime;

        const selectedIsAccepted = selectContactBooleanField(
            'isAccepted',
            existingRef.isAccepted ?? existingResonite.isAccepted,
            incomingRef.isAccepted ?? incomingResonite.isAccepted
        );
        incomingRef.isAccepted = selectedIsAccepted;
        incomingResonite.isAccepted = selectedIsAccepted;
        incomingResonite.contactObservedAt =
            preferIncomingContactFields && incomingContactObservedAt
                ? incomingContactObservedAt
                : existingContactObservedAt || incomingContactObservedAt || 0;

        incomingRef.last_activity = firstNonEmptyString(
            incomingRef.last_activity,
            existingRef.last_activity,
            incomingResonite.realtime?.lastStatusChange,
            existingResonite.realtime?.lastStatusChange,
            incomingResonite.realtime?.lastPresenceTimestamp,
            existingResonite.realtime?.lastPresenceTimestamp
        );
        incomingRef.last_login = firstNonEmptyString(
            incomingRef.last_login,
            existingRef.last_login,
            incomingResonite.realtime?.lastPresenceTimestamp,
            existingResonite.realtime?.lastPresenceTimestamp,
            incomingResonite.realtime?.lastStatusChange,
            existingResonite.realtime?.lastStatusChange
        );

        if (
            !incomingPresenceIsAuthoritative &&
            hasFreshExistingRealtimePresence
        ) {
            normalizedIncoming.state = String(
                existingCtx.state || normalizedIncoming.state || 'offline'
            ).trim();
            normalizedIncoming.status = firstNonEmptyString(
                existingCtx.status,
                existingRef.status,
                normalizedIncoming.status
            );
            incomingRef.state = String(
                existingCtx.state || incomingRef.state || 'offline'
            ).trim();
            incomingRef.status = firstNonEmptyString(
                existingRef.status,
                incomingRef.status
            );
            incomingRef.statusDescription = firstNonEmptyString(
                existingRef.statusDescription,
                incomingRef.statusDescription
            );
            incomingRef.location = firstNonEmptyString(
                existingRef.location,
                incomingRef.location
            );
            incomingRef.traveling = firstNonEmptyString(
                existingRef.traveling,
                incomingRef.traveling
            );
            incomingResonite.onlineStatus = firstNonEmptyString(
                existingResonite.onlineStatus,
                incomingResonite.onlineStatus
            );
            incomingResonite.locationName = firstNonEmptyString(
                existingResonite.locationName,
                incomingResonite.locationName
            );
            incomingResonite.currentSessionHash = firstNonEmptyString(
                existingResonite.currentSessionHash,
                existingResonite.realtime?.currentSessionHash,
                incomingResonite.currentSessionHash
            );
            incomingResonite.currentSessionName = firstNonEmptyString(
                existingResonite.currentSessionName,
                existingResonite.realtime?.currentSessionName,
                incomingResonite.currentSessionName
            );
            incomingResonite.sessionType = firstNonEmptyString(
                existingResonite.sessionType,
                incomingResonite.sessionType
            );
            incomingResonite.outputDevice = firstNonEmptyString(
                existingResonite.outputDevice,
                incomingResonite.outputDevice
            );
            incomingResonite.appVersion = firstNonEmptyString(
                existingResonite.appVersion,
                incomingResonite.appVersion
            );
            incomingResonite.userSessionId = firstNonEmptyString(
                existingResonite.userSessionId,
                incomingResonite.userSessionId
            );
            incomingResonite.compatibilityHash = firstNonEmptyString(
                existingResonite.compatibilityHash,
                incomingResonite.compatibilityHash
            );
            incomingResonite.isPresent =
                typeof existingResonite.isPresent === 'boolean'
                    ? existingResonite.isPresent
                    : incomingResonite.isPresent;
            incomingResonite.isMobile =
                typeof existingResonite.isMobile === 'boolean'
                    ? existingResonite.isMobile
                    : incomingResonite.isMobile;
        }

        const incomingLocation = String(incomingRef.location || '').trim();
        const incomingTraveling = String(incomingRef.traveling || '').trim();
        const incomingLocationName = String(
            incomingResonite.locationName || ''
        ).trim();
        const hasIncomingLiveSession =
            (incomingLocation && incomingLocation !== 'offline') ||
            incomingTraveling ||
            incomingLocationName ||
            String(incomingResonite.currentSessionHash || '').trim() ||
            String(incomingResonite.currentSessionName || '').trim();

        if (normalizedIncoming.state === 'online') {
            incomingRef.statusDescription = firstNonEmptyString(
                incomingRef.statusDescription,
                existingRef.statusDescription
            );
            if (!hasIncomingLiveSession) {
                incomingRef.location = firstNonEmptyString(
                    incomingRef.location !== 'offline'
                        ? incomingRef.location
                        : '',
                    existingRef.location !== 'offline'
                        ? existingRef.location
                        : ''
                );
                incomingRef.traveling = firstNonEmptyString(
                    incomingRef.traveling
                );
                incomingResonite.locationName = firstNonEmptyString(
                    incomingResonite.locationName,
                    existingResonite.locationName
                );
                incomingResonite.currentSessionHash = firstNonEmptyString(
                    incomingResonite.currentSessionHash,
                    existingResonite.currentSessionHash,
                    existingResonite.realtime?.currentSessionHash
                );
                incomingResonite.currentSessionName = firstNonEmptyString(
                    incomingResonite.currentSessionName,
                    existingResonite.currentSessionName,
                    existingResonite.realtime?.currentSessionName
                );
            }
        } else {
            incomingRef.location = 'offline';
            incomingRef.traveling = '';
            incomingRef.statusDescription = '';
            incomingRef.status = '';
            incomingResonite.locationName = '';
            incomingResonite.currentSessionHash = '';
            incomingResonite.currentSessionName = '';
        }

        incomingRef.resonite = {
            ...existingResonite,
            ...incomingRef.resonite,
            ...incomingResonite,
            mergeTrace,
            realtime: {
                ...(existingResonite.realtime || {}),
                ...(incomingRef.resonite?.realtime || {}),
                ...(incomingResonite.realtime || {})
            }
        };

        normalizedIncoming.resonite = incomingRef.resonite;
        return normalizedIncoming;
    }

    function getResonitePersistenceScopeKey(currentUserId) {
        const normalized = String(currentUserId || '')
            .trim()
            .toLowerCase();
        return normalized ? `vrcx-user-${normalized}` : '';
    }

    async function loadPersistedResoniteSnapshot() {
        return await loadPersistedResoniteSnapshotFromDatabase();
    }

    async function loadPersistedResoniteSnapshotFromDatabase() {
        const cachedContacts = await database.getResoniteCachedContacts();
        if (!Array.isArray(cachedContacts) || cachedContacts.length === 0) {
            return [];
        }

        const now = Date.now();
        const freshCachedContacts = cachedContacts.filter((entry) =>
            isFreshResoniteCachedContact(entry, now)
        );
        if (freshCachedContacts.length === 0) {
            return [];
        }

        const latestSnapshotAt = freshCachedContacts.reduce(
            (latest, entry) =>
                Math.max(latest, Number(entry?.lastSuccessfulSnapshotAt || 0)),
            0
        );
        if (
            !latestSnapshotAt ||
            now - latestSnapshotAt > RESONITE_SNAPSHOT_CACHE_MAX_AGE_MS
        ) {
            return [];
        }

        const profileEntries =
            await loadResoniteCachedProfilesForContacts(freshCachedContacts);
        const profilesByUserId = new Map(
            profileEntries.map((entry) => [entry.resoniteUserId, entry.payload])
        );

        return freshCachedContacts
            .map((entry) => {
                const sanitizedFriend = sanitizePersistedResoniteFriend(
                    entry?.payload
                );
                if (!sanitizedFriend) {
                    return null;
                }

                const profilePayload = profilesByUserId.get(
                    String(
                        sanitizedFriend?.resonite?.userId ||
                            stripResonitePrefix(sanitizedFriend.id)
                    ).trim()
                );
                return profilePayload
                    ? mergeResoniteUserProfile(sanitizedFriend, profilePayload)
                    : sanitizedFriend;
            })
            .filter(Boolean)
            .slice(0, RESONITE_SNAPSHOT_CACHE_MAX_FRIENDS);
    }

    function isFreshResoniteCachedContact(entry, now = Date.now()) {
        const lastSuccessfulSnapshotAt = Number(
            entry?.lastSuccessfulSnapshotAt || 0
        );
        const fetchedAt = Number(entry?.fetchedAt || 0);
        const freshnessAnchor = Math.max(lastSuccessfulSnapshotAt, fetchedAt);

        return (
            freshnessAnchor > 0 &&
            now - freshnessAnchor <= RESONITE_SNAPSHOT_CACHE_MAX_AGE_MS
        );
    }

    async function loadResoniteCachedProfilesForContacts(cachedContacts) {
        const cachedUserIds = [
            ...new Set(
                (Array.isArray(cachedContacts) ? cachedContacts : [])
                    .map((entry) =>
                        firstNonEmptyString(
                            entry?.resoniteUserId,
                            entry?.payload?.resonite?.userId,
                            stripResonitePrefix(entry?.externalId),
                            stripResonitePrefix(entry?.payload?.id)
                        )
                    )
                    .filter(Boolean)
            )
        ];

        if (cachedUserIds.length === 0) {
            return [];
        }

        const now = Date.now();
        const cachedProfiles =
            await database.getResoniteCachedProfiles(cachedUserIds);
        return (Array.isArray(cachedProfiles) ? cachedProfiles : []).filter(
            (entry) => {
                const userId = String(entry?.resoniteUserId || '').trim();
                const expiresAt = Number(entry?.expiresAt || 0);
                return (
                    Boolean(userId) &&
                    entry?.payload &&
                    typeof entry.payload === 'object' &&
                    (expiresAt <= 0 || expiresAt > now)
                );
            }
        );
    }

    async function persistResoniteSnapshotCache(snapshot, currentUserId) {
        const persistedAt = Date.now();
        const cachedContacts = Array.isArray(snapshot)
            ? snapshot
                  .map((friendData) =>
                      buildResoniteCachedContactEntry(friendData, persistedAt)
                  )
                  .filter(Boolean)
                  .slice(0, RESONITE_SNAPSHOT_CACHE_MAX_FRIENDS)
            : [];

        await database.replaceResoniteCachedContacts(cachedContacts);
        await database.setResoniteSyncState({
            scope: getResonitePersistenceScopeKey(currentUserId),
            lastAttemptAt: persistedAt,
            lastSuccessfulSnapshotAt: persistedAt,
            snapshotRevision: String(persistedAt),
            activeResoniteUserId: parseResoniteUserIdFromApiKey(
                advancedSettingsStore.resoniteApiKey
            )
        });
    }

    async function recordResoniteSnapshotRefreshState({
        scope,
        phase = 'attempt',
        lastAttemptAt = 0,
        lastSuccessfulSnapshotAt,
        lastErrorText = ''
    }) {
        await recordResoniteRefreshState({
            scope,
            phase,
            lastAttemptAt,
            lastSuccessfulAt: lastSuccessfulSnapshotAt,
            lastErrorText,
            successField: 'lastSuccessfulSnapshotAt',
            failureCountField: 'snapshotFailureCount',
            nextRetryField: 'nextSnapshotRetryAt',
            failureFallbackError: 'refresh-failed',
            maxBackoffMs: RESONITE_SNAPSHOT_MAX_BACKOFF_MS
        });
    }

    function computeResoniteSnapshotRetryAt({
        attemptedAt,
        failureCount,
        baseDelaySeconds,
        maxBackoffMs
    }) {
        const normalizedAttemptAt = Number(attemptedAt || Date.now());
        const normalizedFailures = Math.max(1, Number(failureCount || 1));
        const baseDelayMs =
            Math.max(30, Number(baseDelaySeconds) || 300) * 1000;
        const backoffMs = Math.min(
            Number(maxBackoffMs || RESONITE_SNAPSHOT_MAX_BACKOFF_MS),
            baseDelayMs * Math.pow(2, normalizedFailures - 1)
        );

        return normalizedAttemptAt + backoffMs;
    }

    async function shouldAttemptResoniteRealtimeRefresh(
        scope,
        now = Date.now()
    ) {
        const normalizedScope = String(scope || '').trim();
        if (!normalizedScope) {
            return true;
        }

        const existingState =
            (await database.getResoniteSyncState(normalizedScope)) || {};
        return Number(existingState.nextPresenceRetryAt || 0) <= Number(now);
    }

    async function recordResonitePresenceRefreshState({
        scope,
        phase,
        lastAttemptAt,
        lastSuccessfulPresenceAt,
        lastErrorText = ''
    }) {
        await recordResoniteRefreshState({
            scope,
            phase,
            lastAttemptAt,
            lastSuccessfulAt: lastSuccessfulPresenceAt,
            lastErrorText,
            successField: 'lastSuccessfulPresenceAt',
            failureCountField: 'presenceFailureCount',
            nextRetryField: 'nextPresenceRetryAt',
            failureFallbackError: 'realtime-connect-failed',
            maxBackoffMs: RESONITE_PRESENCE_MAX_BACKOFF_MS
        });
    }

    async function recordResoniteRefreshState({
        scope,
        phase = 'attempt',
        lastAttemptAt = 0,
        lastSuccessfulAt,
        lastErrorText = '',
        successField,
        failureCountField,
        nextRetryField,
        failureFallbackError,
        maxBackoffMs
    }) {
        const normalizedScope = String(scope || '').trim();
        if (!normalizedScope) {
            return;
        }

        const existingState =
            (await database.getResoniteSyncState(normalizedScope)) || {};
        const normalizedAttemptAt = Number(lastAttemptAt || Date.now());
        const normalizedPhase = String(phase || 'attempt').trim();
        let failureCount = Number(existingState[failureCountField] || 0);
        let nextRetryAt = Number(existingState[nextRetryField] || 0);
        let normalizedErrorText =
            normalizedPhase === 'failure'
                ? String(lastErrorText || failureFallbackError).trim()
                : normalizedPhase === 'success'
                  ? ''
                  : String(existingState.lastErrorText || '').trim();

        if (normalizedPhase === 'failure') {
            failureCount += 1;
            nextRetryAt = computeResoniteSnapshotRetryAt({
                attemptedAt: normalizedAttemptAt,
                failureCount,
                baseDelaySeconds: advancedSettingsStore.resoniteRefreshSeconds,
                maxBackoffMs
            });
        } else if (normalizedPhase === 'success') {
            failureCount = 0;
            nextRetryAt = 0;
        }

        await database.setResoniteSyncState({
            scope: normalizedScope,
            lastAttemptAt: normalizedAttemptAt,
            [successField]: lastSuccessfulAt,
            lastErrorText: normalizedErrorText,
            activeResoniteUserId: parseResoniteUserIdFromApiKey(
                advancedSettingsStore.resoniteApiKey
            ),
            [failureCountField]: failureCount,
            [nextRetryField]: nextRetryAt
        });
    }

    function buildResoniteCachedContactEntry(friendData, persistedAt) {
        const sanitizedFriend = sanitizePersistedResoniteFriend(friendData);
        if (!sanitizedFriend) {
            return null;
        }

        const resonite = /** @type {any} */ (sanitizedFriend.resonite || {});
        return {
            externalId: sanitizedFriend.id,
            resoniteUserId: firstNonEmptyString(
                resonite.userId,
                stripResonitePrefix(sanitizedFriend.id)
            ),
            displayName: firstNonEmptyString(
                sanitizedFriend.name,
                sanitizedFriend?.ref?.displayName
            ),
            username: String(resonite.username || '').trim(),
            normalizedUsername: normalizeResoniteHandle(resonite.username),
            contactStatus: String(
                sanitizedFriend?.ref?.contactStatus || ''
            ).trim(),
            isAccepted: sanitizedFriend?.ref?.isAccepted,
            latestMessageTime: String(
                sanitizedFriend?.ref?.latestMessageTime || ''
            ).trim(),
            isSystemContact: isResoniteSystemContact(sanitizedFriend),
            fetchedAt: persistedAt,
            lastSuccessfulSnapshotAt: persistedAt,
            sourceRevision: String(persistedAt),
            payload: sanitizedFriend
        };
    }

    function sanitizePersistedResoniteFriend(friendData) {
        if (!friendData?.id || friendData?.provider !== 'resonite') {
            return null;
        }

        const refResonite = friendData?.ref?.resonite || {};
        const topLevelResonite = friendData?.resonite || {};
        const mergedResonite = {
            ...refResonite,
            ...topLevelResonite,
            realtime: {
                ...(refResonite.realtime || {}),
                ...(topLevelResonite.realtime || {})
            }
        };

        return {
            id: friendData.id,
            provider: 'resonite',
            isExternal: true,
            state: String(friendData.state || 'offline').trim() || 'offline',
            status: String(friendData.status || '').trim(),
            name: String(
                friendData.name || friendData?.ref?.displayName || ''
            ).trim(),
            ref: {
                id: String(friendData?.ref?.id || friendData.id).trim(),
                displayName: String(
                    friendData?.ref?.displayName || friendData.name || ''
                ).trim(),
                status: String(
                    friendData?.ref?.status || friendData.status || ''
                ).trim(),
                state: String(
                    friendData?.ref?.state || friendData.state || ''
                ).trim(),
                location: String(friendData?.ref?.location || '').trim(),
                traveling: String(friendData?.ref?.traveling || '').trim(),
                statusDescription: String(
                    friendData?.ref?.statusDescription || ''
                ).trim(),
                contactStatus: String(
                    friendData?.ref?.contactStatus || ''
                ).trim(),
                latestMessageTime: String(
                    friendData?.ref?.latestMessageTime || ''
                ).trim(),
                isAccepted: friendData?.ref?.isAccepted,
                profileImageUrl: String(
                    friendData?.ref?.profileImageUrl || ''
                ).trim(),
                userIcon: String(friendData?.ref?.userIcon || '').trim(),
                resonite: {
                    userId: firstNonEmptyString(
                        mergedResonite.userId,
                        stripResonitePrefix(friendData.id)
                    ),
                    username: String(mergedResonite.username || '').trim(),
                    onlineStatus: String(
                        mergedResonite.onlineStatus || ''
                    ).trim(),
                    locationName: String(
                        mergedResonite.locationName || ''
                    ).trim(),
                    currentSessionHash: String(
                        mergedResonite.currentSessionHash || ''
                    ).trim(),
                    currentSessionName: String(
                        mergedResonite.currentSessionName || ''
                    ).trim(),
                    userSessionId: String(
                        mergedResonite.userSessionId || ''
                    ).trim(),
                    sessionType: String(
                        mergedResonite.sessionType || ''
                    ).trim(),
                    outputDevice: String(
                        mergedResonite.outputDevice || ''
                    ).trim(),
                    appVersion: String(mergedResonite.appVersion || '').trim(),
                    compatibilityHash: String(
                        mergedResonite.compatibilityHash || ''
                    ).trim(),
                    contactObservedAt: Number(
                        mergedResonite.contactObservedAt || 0
                    ),
                    isPresent: Boolean(mergedResonite.isPresent),
                    profile: {
                        iconUrl: String(
                            mergedResonite.profile?.iconUrl ||
                                friendData?.ref?.profileImageUrl ||
                                ''
                        ).trim(),
                        tagline: String(
                            mergedResonite.profile?.tagline || ''
                        ).trim(),
                        description: String(
                            mergedResonite.profile?.description || ''
                        ).trim()
                    },
                    realtime: {
                        onlineStatus: String(
                            mergedResonite.realtime?.onlineStatus ||
                                mergedResonite.onlineStatus ||
                                ''
                        ).trim(),
                        currentSessionHash: String(
                            mergedResonite.realtime?.currentSessionHash ||
                                mergedResonite.currentSessionHash ||
                                ''
                        ).trim(),
                        currentSessionName: String(
                            mergedResonite.realtime?.currentSessionName ||
                                mergedResonite.currentSessionName ||
                                ''
                        ).trim(),
                        userSessionId: String(
                            mergedResonite.realtime?.userSessionId ||
                                mergedResonite.userSessionId ||
                                ''
                        ).trim(),
                        sessionType: String(
                            mergedResonite.realtime?.sessionType ||
                                mergedResonite.sessionType ||
                                ''
                        ).trim(),
                        outputDevice: String(
                            mergedResonite.realtime?.outputDevice ||
                                mergedResonite.outputDevice ||
                                ''
                        ).trim(),
                        appVersion: String(
                            mergedResonite.realtime?.appVersion ||
                                mergedResonite.appVersion ||
                                ''
                        ).trim(),
                        compatibilityHash: String(
                            mergedResonite.realtime?.compatibilityHash ||
                                mergedResonite.compatibilityHash ||
                                ''
                        ).trim(),
                        isPresent: Boolean(
                            mergedResonite.realtime?.isPresent ??
                            mergedResonite.isPresent
                        ),
                        currentSessionIndex: Number(
                            mergedResonite.realtime?.currentSessionIndex ?? -1
                        ),
                        lastPresenceTimestamp: String(
                            mergedResonite.realtime?.lastPresenceTimestamp || ''
                        ).trim(),
                        lastStatusChange: String(
                            mergedResonite.realtime?.lastStatusChange || ''
                        ).trim(),
                        sourceEvent: String(
                            mergedResonite.realtime?.sourceEvent || ''
                        ).trim()
                    }
                }
            },
            resonite: {
                userId: firstNonEmptyString(
                    mergedResonite.userId,
                    stripResonitePrefix(friendData.id)
                ),
                username: String(mergedResonite.username || '').trim(),
                onlineStatus: String(mergedResonite.onlineStatus || '').trim(),
                locationName: String(mergedResonite.locationName || '').trim(),
                currentSessionHash: String(
                    mergedResonite.currentSessionHash || ''
                ).trim(),
                currentSessionName: String(
                    mergedResonite.currentSessionName || ''
                ).trim(),
                userSessionId: String(
                    mergedResonite.userSessionId || ''
                ).trim(),
                sessionType: String(mergedResonite.sessionType || '').trim(),
                outputDevice: String(mergedResonite.outputDevice || '').trim(),
                appVersion: String(mergedResonite.appVersion || '').trim(),
                compatibilityHash: String(
                    mergedResonite.compatibilityHash || ''
                ).trim(),
                contactObservedAt: Number(
                    mergedResonite.contactObservedAt || 0
                ),
                isPresent: Boolean(mergedResonite.isPresent),
                profile: {
                    iconUrl: String(
                        mergedResonite.profile?.iconUrl ||
                            friendData?.ref?.profileImageUrl ||
                            ''
                    ).trim(),
                    tagline: String(
                        mergedResonite.profile?.tagline || ''
                    ).trim(),
                    description: String(
                        mergedResonite.profile?.description || ''
                    ).trim()
                },
                realtime: {
                    onlineStatus: String(
                        mergedResonite.realtime?.onlineStatus ||
                            mergedResonite.onlineStatus ||
                            ''
                    ).trim(),
                    currentSessionHash: String(
                        mergedResonite.realtime?.currentSessionHash ||
                            mergedResonite.currentSessionHash ||
                            ''
                    ).trim(),
                    currentSessionName: String(
                        mergedResonite.realtime?.currentSessionName ||
                            mergedResonite.currentSessionName ||
                            ''
                    ).trim(),
                    userSessionId: String(
                        mergedResonite.realtime?.userSessionId ||
                            mergedResonite.userSessionId ||
                            ''
                    ).trim(),
                    sessionType: String(
                        mergedResonite.realtime?.sessionType ||
                            mergedResonite.sessionType ||
                            ''
                    ).trim(),
                    outputDevice: String(
                        mergedResonite.realtime?.outputDevice ||
                            mergedResonite.outputDevice ||
                            ''
                    ).trim(),
                    appVersion: String(
                        mergedResonite.realtime?.appVersion ||
                            mergedResonite.appVersion ||
                            ''
                    ).trim(),
                    compatibilityHash: String(
                        mergedResonite.realtime?.compatibilityHash ||
                            mergedResonite.compatibilityHash ||
                            ''
                    ).trim(),
                    isPresent: Boolean(
                        mergedResonite.realtime?.isPresent ??
                        mergedResonite.isPresent
                    ),
                    currentSessionIndex: Number(
                        mergedResonite.realtime?.currentSessionIndex ?? -1
                    ),
                    lastPresenceTimestamp: String(
                        mergedResonite.realtime?.lastPresenceTimestamp || ''
                    ).trim(),
                    lastStatusChange: String(
                        mergedResonite.realtime?.lastStatusChange || ''
                    ).trim(),
                    sourceEvent: String(
                        mergedResonite.realtime?.sourceEvent || ''
                    ).trim()
                }
            }
        };
    }

    return {
        state,

        friends,

        vipFriends,
        onlineFriends,
        activeFriends,
        offlineFriends,
        friendsInSameInstance,
        resoniteFriendsInSameSession,

        allFavoriteFriendIds,
        allFavoriteOnlineFriends,
        localFavoriteFriends,
        isRefreshFriendsLoading,
        onlineFriendCount,
        friendLog,
        friendLogTable,
        pendingOfflineMap,
        pendingOfflineDelay,

        updateLocalFavoriteFriends,
        updateSidebarFavorites,
        deleteFriend,
        refreshFriendsStatus,
        addFriend,
        refreshFriends,
        updateOnlineFriendCounter,
        getAllUserStats,
        getAllUserMutualCount,
        getAllUserMutualOptedOut,
        initFriendLog,
        migrateFriendLog,
        getFriendLog,
        tryApplyFriendOrder,
        resetFriendLog,
        reindexSortedFriend,
        resetDerivedDebugCounters,
        getDerivedDebugCounters,
        initFriendLogHistoryTable,
        setIsRefreshFriendsLoading,
        hydratePersistedResoniteState,
        clearResoniteState,
        refreshResoniteFriends,
        commitPendingResoniteUpdate,
        upsertResoniteFriend,
        removeStaleResoniteFriends
    };
});
