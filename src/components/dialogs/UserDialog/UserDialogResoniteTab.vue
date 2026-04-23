<template>
    <div class="min-h-0 overflow-auto px-3 py-2 space-y-3">
        <div v-if="!hasResoniteData" class="text-sm text-muted-foreground">No Resonite data available.</div>

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
                    <span class="break-words whitespace-pre-wrap">{{ resonite.profile?.tagline || '-' }}</span>

                    <span class="text-muted-foreground">Description</span>
                    <span class="break-words whitespace-pre-wrap">{{ resonite.profile?.description || '-' }}</span>

                    <span class="text-muted-foreground">Tags</span>
                    <span class="break-words">{{ formattedTags }}</span>
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
    import { computed } from 'vue';
    import { storeToRefs } from 'pinia';

    import { useUserStore } from '../../../stores';

    const { userDialog } = storeToRefs(useUserStore());

    const resonite = computed(() => userDialog.value?.ref?.resonite || {});

    const hasResoniteData = computed(() => resonite.value && Object.keys(resonite.value).length > 0);

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
