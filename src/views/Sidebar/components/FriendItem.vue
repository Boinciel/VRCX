<template>
    <div
        class="box-border flex items-center p-1.5 text-[13px] cursor-pointer hover:bg-muted/50 hover:rounded-lg"
        @click="showUserDialog(friend.id)">
        <template v-if="friend.ref">
            <div class="relative inline-block flex-none size-9 mr-2.5" :class="friendStatusClass">
                <Avatar class="size-full rounded-full">
                    <AvatarImage :src="userImage(friend.ref, true)" class="object-cover" />
                    <AvatarFallback>
                        <User class="size-5 text-muted-foreground" />
                    </AvatarFallback>
                </Avatar>
            </div>
            <div class="flex-1 overflow-hidden h-9 flex flex-col justify-between">
                <span
                    v-if="!hideNicknames && friend.$nickName"
                    class="block truncate font-medium leading-[18px]"
                    :style="{ color: friend.ref.$userColour }">
                    {{ friend.ref.displayName }} ({{ friend.$nickName }})
                </span>
                <span
                    v-else
                    class="block truncate font-medium leading-[18px]"
                    :style="{ color: friend.ref.$userColour }"
                    >{{ friend.ref.displayName
                    }}{{ isGroupByInstance && allFavoriteFriendIds.has(friend.id) ? ' ⭐' : '' }}</span
                >

                <span v-if="isFriendActiveOrOffline" class="block truncate text-xs">{{
                    friend.ref.statusDescription
                }}</span>
                <template v-else>
                    <div v-if="friend.pendingOffline" class="extra block truncate text-xs">
                        {{ t('side_panel.pending_offline') }}
                    </div>
                    <template v-else-if="isGroupByInstance">
                        <template v-if="!friend.isExternal">
                            <div class="flex items-center">
                                <Spinner v-if="isFriendTraveling" class="mr-1" />
                                <Timer
                                    class="text-xs"
                                    :epoch="epoch"
                                    :style="
                                        isFriendTraveling ? { display: 'inline-block', overflow: 'unset' } : undefined
                                    " />
                            </div>
                        </template>
                        <template v-else>
                            <span class="text-xs" v-html="renderedExternalPresenceLine"></span>
                        </template>
                    </template>
                    <template v-else>
                        <Location
                            v-if="!friend.isExternal"
                            class="extra block truncate text-xs!"
                            :location="locationProp"
                            :traveling="travelingProp"
                            :link="false" />
                        <span v-else class="text-xs" v-html="renderedExternalPresenceLine"></span>
                    </template>
                </template>
            </div>
        </template>
        <template v-else-if="!friend.ref && !isRefreshFriendsLoading">
            <span>{{ friend.name || friend.id }}</span>
            <Button size="sm" variant="ghost" class="mr-1 w-6 h-6 text-xs" @click.stop="confirmDeleteFriend(friend.id)"
                ><Trash2 class="h-4 w-4" />
            </Button>
        </template>
    </div>
</template>

<script setup>
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Trash2, User } from 'lucide-vue-next';
    import { Button } from '@/components/ui/button';
    import { Spinner } from '@/components/ui/spinner';
    import { computed } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import Location from '@/components/Location.vue';
    import Timer from '@/components/Timer.vue';

    import { useAppearanceSettingsStore, useFriendStore } from '../../../stores';
    import { useUserDisplay } from '../../../composables/useUserDisplay';
    import { getResoniteSessionByHash } from '../../../services/resoniteRealtime';
    import { renderResoniteRichText } from '../../../shared/utils/resoniteRichText';

    import '@/styles/status-icon.css';
    import { showUserDialog } from '../../../coordinators/userCoordinator';
    import { confirmDeleteFriend } from '../../../coordinators/friendRelationshipCoordinator';

    const props = defineProps({
        friend: { type: Object, required: true },
        isGroupByInstance: Boolean
    });

    const { hideNicknames } = storeToRefs(useAppearanceSettingsStore());
    const { isRefreshFriendsLoading, allFavoriteFriendIds } = storeToRefs(useFriendStore());
    const { userImage, userStatusClass } = useUserDisplay();

    const { t } = useI18n();

    const resoniteAccessLevelLabels = {
        private: 'Private',
        lan: 'LAN',
        contacts: 'Contacts only',
        contactsplus: 'Contacts+',
        registeredusers: 'Registered users',
        anyone: 'Public'
    };

    const isFriendTraveling = computed(() => props.friend.ref?.location === 'traveling');
    const isFriendActiveOrOffline = computed(() => props.friend.state === 'active' || props.friend.state === 'offline');

    const friendStatusClass = computed(() => {
        return userStatusClass(props.friend.ref, props.friend.pendingOffline);
    });

    function formatResonitePresenceLocation(location) {
        const baseLocation = String(location || '').trim();
        if (!baseLocation) {
            return '';
        }

        const sessionHash = String(
            props.friend.ref?.resonite?.currentSessionHash || props.friend.resonite?.currentSessionHash || ''
        ).trim();
        const accessLevel = String(getResoniteSessionByHash(sessionHash)?.accessLevel || '')
            .trim()
            .toLowerCase();
        const accessSuffix = resoniteAccessLevelLabels[accessLevel] || '';

        if (!accessSuffix || baseLocation.toLowerCase() === accessSuffix.toLowerCase()) {
            return baseLocation;
        }

        return `${baseLocation} · ${accessSuffix}`;
    }

    const externalPresenceLine = computed(() => {
        const traveling = String(props.friend.ref?.traveling || '').trim();
        const rawLocation = String(props.friend.ref?.location || '').trim();
        // 'offline' is a sentinel from contacts-only payloads — don't display it as a world name
        const location = rawLocation !== 'offline' ? formatResonitePresenceLocation(rawLocation) : '';
        const statusDescription = String(props.friend.ref?.statusDescription || '').trim();
        const provider = String(props.friend.provider || 'external').trim();

        return traveling || location || statusDescription || `[${provider}]`;
    });

    const epoch = computed(() =>
        isFriendTraveling.value ? props.friend.ref?.$travelingToTime : props.friend.ref?.$location_at
    );

    const locationProp = computed(() => props.friend.ref?.location || '');
    const travelingProp = computed(() => props.friend.ref?.travelingToLocation || '');

    // For Resonite (external) friends render colour tags; for others just escape the text.
    const renderedExternalPresenceLine = computed(() =>
        props.friend.isExternal ? renderResoniteRichText(externalPresenceLine.value) : externalPresenceLine.value
    );
</script>
