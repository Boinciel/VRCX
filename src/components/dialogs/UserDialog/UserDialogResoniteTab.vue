<template>
    <div class="min-h-0 overflow-auto px-3 py-2 space-y-3">
        <div v-if="!hasResoniteData" class="text-sm text-muted-foreground">No Resonite data available.</div>

        <div v-if="showInventorySection" class="rounded-md border border-border p-3">
            <div class="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div class="text-sm font-medium">Inventory</div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1 rounded-md border border-border p-1">
                        <span class="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Sort
                        </span>
                        <button
                            v-for="option in inventorySortOptions"
                            :key="option.value"
                            type="button"
                            class="rounded px-2 py-1 text-[11px] transition-colors hover:bg-accent disabled:cursor-not-allowed"
                            :class="
                                inventorySortMode === option.value
                                    ? 'bg-accent text-foreground'
                                    : 'text-muted-foreground'
                            "
                            :disabled="inventoryLoading"
                            @click="setInventorySortMode(option.value)">
                            {{ option.label }}
                        </button>
                    </div>
                    <button
                        type="button"
                        class="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="inventoryLoading"
                        @click="refreshInventory">
                        Refresh
                    </button>
                    <button
                        type="button"
                        class="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="inventoryLoading || isInventoryRoot"
                        @click="goUpInventoryPath">
                        Up
                    </button>
                    <button
                        type="button"
                        class="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="inventoryLoading || isInventoryRoot"
                        @click="goToInventoryRoot">
                        Home
                    </button>
                </div>
            </div>

            <div v-if="!selfResoniteUserId" class="text-xs text-muted-foreground">
                No signed-in Resonite identity is available for inventory browsing.
            </div>

            <template v-else>
                <div class="mb-3 flex items-start justify-between gap-3 text-xs text-muted-foreground">
                    <div class="flex min-w-0 flex-wrap items-center gap-1">
                        <template
                            v-for="(segment, index) in inventoryBreadcrumbs"
                            :key="`${segment.ownerId}:${segment.path}:${index}`">
                            <span v-if="index > 0">/</span>
                            <button
                                type="button"
                                class="rounded px-1 py-0.5 text-left transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent"
                                :disabled="inventoryLoading || index === inventoryBreadcrumbs.length - 1"
                                @click="goToInventoryBreadcrumb(index)">
                                <span v-html="renderResoniteRichText(segment.label)" />
                            </button>
                        </template>
                    </div>
                    <TooltipWrapper v-if="showInventoryTargetInfo" side="top">
                        <template #content>
                            <div class="max-w-80 space-y-1 text-left text-xs">
                                <div>
                                    <span class="font-medium">Original folder:</span>
                                    <span class="inline-flex flex-wrap items-center gap-1">
                                        <template
                                            v-for="(segment, index) in inventoryBreadcrumbs"
                                            :key="`tooltip-visible-${segment.ownerId}:${segment.path}:${index}`">
                                            <span v-if="index > 0">/</span>
                                            <span v-html="renderResoniteRichText(segment.label)" />
                                        </template>
                                    </span>
                                </div>
                                <div>
                                    <span class="font-medium">Owner:</span>
                                    <span v-html="inventoryOwnerDisplayHtml" />
                                </div>
                            </div>
                        </template>
                        <button
                            type="button"
                            class="inline-flex size-5 flex-none items-center justify-center rounded-full border border-border text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            :disabled="inventoryLoading"
                            aria-label="Show resolved inventory path">
                            ?
                        </button>
                    </TooltipWrapper>
                </div>

                <div
                    v-if="inventoryError"
                    class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {{ inventoryError }}
                </div>

                <div
                    v-else-if="inventoryLoading && inventoryRecords.length === 0"
                    class="text-xs text-muted-foreground">
                    Loading inventory...
                </div>

                <div v-else-if="inventoryRecords.length === 0" class="text-xs text-muted-foreground">
                    This inventory folder is empty.
                </div>

                <div v-else class="space-y-3">
                    <div v-if="inventoryPathRecords.length > 0" class="space-y-1">
                        <div class="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Folders and Links
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <button
                                v-for="record in inventoryPathRecords"
                                :key="record.id"
                                type="button"
                                class="flex min-h-20 w-full flex-col justify-between gap-2 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent disabled:cursor-wait disabled:opacity-70"
                                :disabled="inventoryLoading && inventoryPendingRecordId === record.id"
                                @click="openInventoryRecord(record)">
                                <div class="min-w-0 flex-1">
                                    <div
                                        class="line-clamp-2 text-sm font-medium"
                                        v-html="renderResoniteRichText(record.name)" />
                                </div>
                                <div class="truncate text-xs text-muted-foreground">
                                    {{ formatInventoryRecordMeta(record) }}
                                </div>
                            </button>
                        </div>
                    </div>

                    <div v-if="inventoryObjectRecords.length > 0" class="space-y-1">
                        <div class="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Items
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <button
                                v-for="record in inventoryObjectRecords"
                                :key="record.id"
                                type="button"
                                class="flex min-h-20 w-full gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent disabled:cursor-wait disabled:opacity-70"
                                :disabled="inventoryLoading && inventoryPendingRecordId === record.id"
                                @click="openInventoryObjectPreview(record)">
                                <div
                                    class="size-12 flex-none overflow-hidden rounded-md border border-border bg-muted/40">
                                    <img
                                        v-if="record.thumbnailUrl"
                                        :src="record.thumbnailUrl"
                                        :alt="record.name"
                                        class="size-full object-cover" />
                                    <div
                                        v-else
                                        class="flex size-full items-center justify-center text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {{ record.recordTypeLabel }}
                                    </div>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div
                                        class="line-clamp-2 text-sm font-medium"
                                        v-html="renderResoniteRichText(record.name)" />
                                    <div class="mt-1 truncate text-xs text-muted-foreground">
                                        {{ formatInventoryRecordMeta(record) }}
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <template v-else>
            <div class="rounded-md border border-border p-3">
                <div class="mb-2 text-sm font-medium">Profile</div>
                <div class="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1 text-xs">
                    <span class="text-muted-foreground">Username</span>
                    <span>{{ resonite.username || '-' }}</span>

                    <span class="text-muted-foreground">Normalized Username</span>
                    <span>{{ resonite.normalizedUsername || '-' }}</span>

                    <span class="text-muted-foreground">Registered</span>
                    <span>{{ formattedRegistrationDate }}</span>

                    <span class="text-muted-foreground">Verified</span>
                    <span>{{ formatBool(resonite.isVerified) }}</span>

                    <span class="text-muted-foreground">Tagline</span>
                    <span class="wrap-break-word whitespace-pre-wrap">{{ resonite.profile?.tagline || '-' }}</span>

                    <span class="text-muted-foreground">Description</span>
                    <span class="wrap-break-word whitespace-pre-wrap">{{ resonite.profile?.description || '-' }}</span>

                    <span class="text-muted-foreground">Tags</span>
                    <span class="wrap-break-word">{{ formattedTags }}</span>
                </div>
            </div>

            <div class="rounded-md border border-border p-3">
                <div class="mb-2 text-sm font-medium">Presence</div>
                <div class="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1 text-xs">
                    <span class="text-muted-foreground">Online Status</span>
                    <span>{{ resonite.onlineStatus || '-' }}</span>

                    <span class="text-muted-foreground">Session Type</span>
                    <span>{{ resonite.sessionType || '-' }}</span>

                    <span class="text-muted-foreground">Output Device</span>
                    <span>{{ resonite.outputDevice || '-' }}</span>

                    <span class="text-muted-foreground">App Version</span>
                    <span>{{ resonite.appVersion || '-' }}</span>

                    <span class="text-muted-foreground">Location Name</span>
                    <span>{{ resonite.locationName || '-' }}</span>

                    <span class="text-muted-foreground">Present</span>
                    <span>{{ formatBool(resonite.isPresent) }}</span>

                    <span class="text-muted-foreground">User Session Id</span>
                    <span class="break-all">{{ resonite.userSessionId || '-' }}</span>

                    <span class="text-muted-foreground">Compatibility Hash</span>
                    <span class="break-all">{{ resonite.compatibilityHash || '-' }}</span>
                </div>
            </div>

            <div class="rounded-md border border-border p-3">
                <div class="mb-2 text-sm font-medium">Realtime Snapshot</div>
                <pre class="max-h-80 overflow-auto text-xs whitespace-pre-wrap break-all">{{ realtimeJson }}</pre>
            </div>
        </template>
    </div>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';

    import { useGalleryStore, useUserStore } from '../../../stores';
    import { stripResonitePrefix } from '../../../shared/utils/resonite';
    import {
        fetchResoniteInventoryRecords,
        fetchResoniteInventoryOwnerDetails,
        normalizeResoniteInventoryPath,
        RESONITE_INVENTORY_ROOT_PATH,
        resolveResoniteInventoryLink,
        sortResoniteInventoryRecords
    } from '../../../services/resoniteInventory';
    import { renderResoniteRichText } from '../../../shared/utils/resoniteRichText';

    const { userDialog, currentUser } = storeToRefs(useUserStore());
    const { showFullscreenImageDialog } = useGalleryStore();

    function firstNonEmptyString(...values) {
        for (const value of values) {
            const normalized = String(value || '').trim();
            if (normalized) {
                return normalized;
            }
        }

        return '';
    }

    const selfResonitePresence = computed(() => currentUser.value?.$resonitePresence || {});

    const isResoniteSelf = computed(() => {
        const dialogId = stripResonitePrefix(userDialog.value?.id);
        if (!dialogId || dialogId === String(currentUser.value?.id || '').trim()) {
            return false;
        }

        const linkedContactId = stripResonitePrefix(selfResonitePresence.value?.linkedContactId);
        const linkedUserId = stripResonitePrefix(selfResonitePresence.value?.linkedUserId);

        return dialogId === linkedContactId || dialogId === linkedUserId;
    });

    const selfResoniteUserId = computed(() =>
        firstNonEmptyString(
            userDialog.value?.ref?.resonite?.userId,
            isResoniteSelf.value ? selfResonitePresence.value?.linkedUserId : ''
        )
    );

    const resonite = computed(() => {
        const dialogResonite = userDialog.value?.ref?.resonite || {};
        if (!isResoniteSelf.value) {
            return dialogResonite;
        }

        return {
            ...dialogResonite,
            userId: selfResoniteUserId.value,
            username: firstNonEmptyString(dialogResonite.username, selfResonitePresence.value?.linkedDisplayName),
            onlineStatus: firstNonEmptyString(dialogResonite.onlineStatus, selfResonitePresence.value?.status),
            locationName: firstNonEmptyString(
                dialogResonite.locationName,
                selfResonitePresence.value?.locationName,
                selfResonitePresence.value?.currentSessionName
            ),
            currentSessionName: firstNonEmptyString(
                dialogResonite.currentSessionName,
                selfResonitePresence.value?.currentSessionName
            ),
            currentSessionHash: firstNonEmptyString(
                dialogResonite.currentSessionHash,
                selfResonitePresence.value?.currentSessionHash
            ),
            outputDevice: firstNonEmptyString(dialogResonite.outputDevice, selfResonitePresence.value?.outputDevice),
            appVersion: firstNonEmptyString(dialogResonite.appVersion, selfResonitePresence.value?.appVersion)
        };
    });

    const hasResoniteData = computed(
        () => Boolean(resonite.value && Object.keys(resonite.value).length > 0) || Boolean(selfResoniteUserId.value)
    );

    const showInventorySection = computed(() => isResoniteSelf.value && Boolean(selfResoniteUserId.value));

    const formattedRegistrationDate = computed(() => formatDateTime(resonite.value?.registrationDate));

    const formattedTags = computed(() => {
        const tags = Array.isArray(resonite.value?.tags)
            ? resonite.value.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
            : [];
        return tags.length > 0 ? tags.join(', ') : '-';
    });

    const realtimeJson = computed(() => {
        const snapshot = resonite.value?.realtime || {};
        try {
            return JSON.stringify(snapshot, null, 2);
        } catch {
            return '{}';
        }
    });

    const inventoryOwnerId = ref('');
    const inventoryOwnerDetails = ref(null);
    const inventoryPath = ref(RESONITE_INVENTORY_ROOT_PATH);
    const inventoryTrail = ref([]);
    const inventoryRecords = ref([]);
    const inventorySortMode = ref('name-asc');
    const inventoryLoading = ref(false);
    const inventoryError = ref('');
    const inventoryPendingRecordId = ref('');
    const inventoryRequestId = ref(0);

    const inventorySortOptions = [
        { value: 'name-asc', label: 'Name' },
        { value: 'created-desc', label: 'Newest' },
        { value: 'created-asc', label: 'Oldest' }
    ];

    const isInventoryRoot = computed(
        () => normalizeResoniteInventoryPath(inventoryPath.value) === RESONITE_INVENTORY_ROOT_PATH
    );
    const sortedInventoryRecords = computed(() =>
        sortResoniteInventoryRecords(inventoryRecords.value, inventorySortMode.value)
    );
    const inventoryPathRecords = computed(() =>
        sortedInventoryRecords.value.filter((record) => Boolean(record?.isNavigable))
    );
    const inventoryObjectRecords = computed(() =>
        sortedInventoryRecords.value.filter((record) => !record?.isNavigable)
    );

    const inventoryBreadcrumbs = computed(() => inventoryTrail.value);
    const inventoryResolvedPathSegments = computed(() =>
        normalizeResoniteInventoryPath(inventoryPath.value)
            .split('\\')
            .map((segment) => segment.trim())
            .filter(Boolean)
    );
    const inventoryOwnerDisplayText = computed(() =>
        firstNonEmptyString(
            inventoryOwnerDetails.value?.username,
            inventoryOwnerDetails.value?.displayName,
            inventoryOwnerId.value
        )
    );
    const inventoryOwnerDisplayHtml = computed(() =>
        renderResoniteRichText(inventoryOwnerDisplayText.value || inventoryOwnerId.value)
    );
    const showInventoryTargetInfo = computed(() => {
        if (!inventoryOwnerId.value || !inventoryPath.value || inventoryBreadcrumbs.value.length === 0) {
            return false;
        }

        if (inventoryOwnerId.value !== selfResoniteUserId.value) {
            return true;
        }

        const visibleLabels = inventoryBreadcrumbs.value
            .map((segment) => String(segment?.label || '').trim())
            .filter(Boolean);
        const resolvedLabels = inventoryResolvedPathSegments.value;

        return visibleLabels.join('\\') !== resolvedLabels.join('\\');
    });

    watch(
        () => [showInventorySection.value, selfResoniteUserId.value, inventoryPath.value, inventoryOwnerId.value],
        async ([enabled, userId, path, ownerId]) => {
            if (!enabled || !userId) {
                inventoryRecords.value = [];
                inventoryError.value = '';
                inventoryLoading.value = false;
                return;
            }

            await loadInventory({
                userId,
                ownerId: ownerId || userId,
                path
            });
        },
        { immediate: true }
    );

    watch(
        () => selfResoniteUserId.value,
        (userId) => {
            inventoryOwnerId.value = String(userId || '').trim();
            goToInventoryPath(RESONITE_INVENTORY_ROOT_PATH, {
                ownerId: inventoryOwnerId.value,
                trail: buildInventoryTrailFromPath(RESONITE_INVENTORY_ROOT_PATH, inventoryOwnerId.value)
            });
        },
        { immediate: true }
    );

    watch(
        () => inventoryOwnerId.value,
        async (ownerId) => {
            const normalizedOwnerId = String(ownerId || '').trim();
            if (!normalizedOwnerId) {
                inventoryOwnerDetails.value = null;
                return;
            }

            try {
                inventoryOwnerDetails.value = await fetchResoniteInventoryOwnerDetails(normalizedOwnerId);
            } catch {
                inventoryOwnerDetails.value = null;
            }
        },
        { immediate: true }
    );

    async function loadInventory({ userId, ownerId, path }) {
        const requestId = inventoryRequestId.value + 1;
        inventoryRequestId.value = requestId;
        inventoryLoading.value = true;
        inventoryError.value = '';

        try {
            const nextRecords = await fetchResoniteInventoryRecords({
                userId,
                ownerId,
                path
            });
            if (inventoryRequestId.value !== requestId) {
                return;
            }

            inventoryRecords.value = nextRecords;
        } catch (error) {
            if (inventoryRequestId.value !== requestId) {
                return;
            }

            inventoryRecords.value = [];
            inventoryError.value = String(error?.message || error || 'Failed to load inventory');
        } finally {
            if (inventoryRequestId.value === requestId) {
                inventoryLoading.value = false;
                inventoryPendingRecordId.value = '';
            }
        }
    }

    async function openInventoryRecord(record) {
        if (!record?.isNavigable || !selfResoniteUserId.value || inventoryPendingRecordId.value) {
            return;
        }

        inventoryPendingRecordId.value = String(record.id || '').trim();
        inventoryError.value = '';
        let shouldResetPendingRecord = true;

        try {
            if (record.isLink) {
                const linkTarget = await resolveResoniteInventoryLink(record);
                setInventoryLocation({
                    ownerId: firstNonEmptyString(linkTarget.ownerId, selfResoniteUserId.value),
                    path: linkTarget.absolutePath,
                    trail: [
                        ...inventoryBreadcrumbs.value,
                        createInventoryBreadcrumb(
                            record.name,
                            firstNonEmptyString(linkTarget.ownerId, selfResoniteUserId.value),
                            linkTarget.absolutePath
                        )
                    ]
                });
                shouldResetPendingRecord = false;
            } else {
                const nextOwnerId = firstNonEmptyString(record.ownerId, selfResoniteUserId.value);
                const nextPath = normalizeResoniteInventoryPath(record.absolutePath);
                setInventoryLocation({
                    ownerId: nextOwnerId,
                    path: nextPath,
                    trail: [
                        ...inventoryBreadcrumbs.value,
                        createInventoryBreadcrumb(record.name, nextOwnerId, nextPath)
                    ]
                });
                shouldResetPendingRecord = false;
            }
        } catch (error) {
            inventoryError.value = String(error?.message || error || 'Failed to open inventory folder');
        } finally {
            if (shouldResetPendingRecord) {
                inventoryPendingRecordId.value = '';
            }
        }
    }

    function openInventoryObjectPreview(record) {
        if (!record?.thumbnailUrl) {
            return;
        }

        showFullscreenImageDialog(record.thumbnailUrl, getInventoryPreviewName(record));
    }

    function goToInventoryPath(path, options = {}) {
        setInventoryLocation({
            ownerId: options.ownerId || inventoryOwnerId.value || selfResoniteUserId.value,
            path,
            trail:
                options.trail ||
                buildInventoryTrailFromPath(path, options.ownerId || inventoryOwnerId.value || selfResoniteUserId.value)
        });
    }

    function goToInventoryBreadcrumb(index) {
        const breadcrumb = inventoryBreadcrumbs.value[index];
        if (!breadcrumb) {
            return;
        }

        setInventoryLocation({
            ownerId: breadcrumb.ownerId,
            path: breadcrumb.path,
            trail: inventoryBreadcrumbs.value.slice(0, index + 1)
        });
    }

    function goToInventoryRoot() {
        goToInventoryPath(RESONITE_INVENTORY_ROOT_PATH, {
            ownerId: selfResoniteUserId.value,
            trail: buildInventoryTrailFromPath(RESONITE_INVENTORY_ROOT_PATH, selfResoniteUserId.value)
        });
    }

    function goUpInventoryPath() {
        if (inventoryBreadcrumbs.value.length <= 1) {
            goToInventoryRoot();
            return;
        }

        goToInventoryBreadcrumb(inventoryBreadcrumbs.value.length - 2);
    }

    async function refreshInventory() {
        await loadInventory({
            userId: selfResoniteUserId.value,
            ownerId: inventoryOwnerId.value || selfResoniteUserId.value,
            path: inventoryPath.value
        });
    }

    function setInventorySortMode(sortMode) {
        inventorySortMode.value = sortMode;
    }

    function formatInventoryRecordMeta(record) {
        const details = [String(record?.recordTypeLabel || '').trim()];
        const createdAt = formatDateTime(record?.createdAt);
        if (createdAt !== '-') {
            details.push(createdAt);
        }

        return details.filter(Boolean).join(' · ');
    }

    function getInventoryPreviewName(record) {
        return String(record?.name || record?.id || 'Resonite inventory item').trim();
    }

    function setInventoryLocation({ ownerId, path, trail }) {
        inventoryOwnerId.value = firstNonEmptyString(ownerId, selfResoniteUserId.value);
        inventoryPath.value = normalizeResoniteInventoryPath(path);
        inventoryTrail.value =
            Array.isArray(trail) && trail.length > 0
                ? trail.map((segment) => ({
                      label: String(segment?.label || '').trim() || getInventoryPathLabel(segment?.path),
                      ownerId: firstNonEmptyString(segment?.ownerId, inventoryOwnerId.value),
                      path: normalizeResoniteInventoryPath(segment?.path)
                  }))
                : buildInventoryTrailFromPath(inventoryPath.value, inventoryOwnerId.value);
    }

    function buildInventoryTrailFromPath(path, ownerId) {
        const normalizedPath = normalizeResoniteInventoryPath(path);
        const rawSegments = normalizedPath
            .split('\\')
            .map((segment) => segment.trim())
            .filter(Boolean);
        const segments =
            rawSegments[0] === RESONITE_INVENTORY_ROOT_PATH
                ? rawSegments
                : [RESONITE_INVENTORY_ROOT_PATH, ...rawSegments];

        return segments.map((label, index) =>
            createInventoryBreadcrumb(label, ownerId, segments.slice(0, index + 1).join('\\'))
        );
    }

    function createInventoryBreadcrumb(label, ownerId, path) {
        return {
            label: String(label || '').trim() || getInventoryPathLabel(path),
            ownerId: firstNonEmptyString(ownerId, selfResoniteUserId.value),
            path: normalizeResoniteInventoryPath(path)
        };
    }

    function getInventoryPathLabel(path) {
        const normalizedPath = normalizeResoniteInventoryPath(path);
        const segments = normalizedPath
            .split('\\')
            .map((segment) => segment.trim())
            .filter(Boolean);

        return segments[segments.length - 1] || RESONITE_INVENTORY_ROOT_PATH;
    }

    function formatBool(value) {
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        return '-';
    }

    function formatDateTime(value) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            return '-';
        }

        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) {
            return normalized;
        }

        return parsed.toLocaleString();
    }
</script>
