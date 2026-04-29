<template>
    <div
        class="box-border flex items-center p-1.5 text-[13px] cursor-pointer hover:bg-muted/50 hover:rounded-lg"
        @click="handleClick">
        <template v-if="friend?.ref">
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

                <span v-if="isFriendActiveOrOffline && !friend.isExternal" class="block truncate text-xs">{{
                    friend.ref.statusDescription
                }}</span>
                <span v-else-if="isFriendActiveOrOffline" class="flex min-w-0 items-center gap-1 text-xs">
                    <img
                        v-if="showResoniteProviderIcon"
                        :src="resoniteProviderIconUrl"
                        alt="Resonite"
                        class="size-3.5 flex-none" />
                    <span class="block truncate" v-html="renderedExternalPresenceLine"></span>
                </span>
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
                            <span class="flex min-w-0 items-center gap-1 text-xs">
                                <img
                                    v-if="showResoniteProviderIcon"
                                    :src="resoniteProviderIconUrl"
                                    alt="Resonite"
                                    class="size-3.5 flex-none" />
                                <span class="block truncate" v-html="renderedExternalPresenceLine"></span>
                            </span>
                        </template>
                    </template>
                    <template v-else>
                        <Location
                            v-if="!friend.isExternal"
                            class="extra block truncate text-xs!"
                            :location="locationProp"
                            :traveling="travelingProp"
                            :link="false" />
                        <span v-else class="flex min-w-0 items-center gap-1 text-xs">
                            <img
                                v-if="showResoniteProviderIcon"
                                :src="resoniteProviderIconUrl"
                                alt="Resonite"
                                class="size-3.5 flex-none" />
                            <span class="block truncate" v-html="renderedExternalPresenceLine"></span>
                        </span>
                    </template>
                </template>
            </div>
        </template>
        <template v-else-if="friend && !friend.ref && !isRefreshFriendsLoading">
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
    import { formatResoniteWorldLabel } from '../../../shared/utils/resoniteWorldLabel';

    import '@/styles/status-icon.css';
    import { showUserDialog } from '../../../coordinators/userCoordinator';
    import { confirmDeleteFriend } from '../../../coordinators/friendRelationshipCoordinator';

    const resoniteProviderIconUrl = '/images/resonite/resonite_color.svg';

    const props = defineProps({
        friend: { type: Object, default: null },
        isGroupByInstance: Boolean
    });

    const { hideNicknames } = storeToRefs(useAppearanceSettingsStore());
    const { isRefreshFriendsLoading, allFavoriteFriendIds } = storeToRefs(useFriendStore());
    const { userImage, userStatusClass } = useUserDisplay();

    const { t } = useI18n();

    function handleClick() {
        if (props.friend?.id) {
            showUserDialog(props.friend.id);
        }
    }

    const isFriendTraveling = computed(() => props.friend?.ref?.location === 'traveling');
    const isFriendActiveOrOffline = computed(
        () => props.friend?.state === 'active' || props.friend?.state === 'offline'
    );

    const friendStatusClass = computed(() => {
        return userStatusClass(props.friend?.ref, props.friend?.pendingOffline);
    });

    function formatResonitePresenceLocation(location) {
        const baseLocation = String(location || '').trim();
        if (!baseLocation) {
            return '';
        }

        // 'private' is a sentinel — always render as 'Private' without appending an access level
        if (baseLocation.toLowerCase() === 'private') {
            return 'Private';
        }

        const sessionHash = String(
            props.friend?.ref?.resonite?.currentSessionHash || props.friend?.resonite?.currentSessionHash || ''
        ).trim();
        const accessLevel = String(
            props.friend?.ref?.resonite?.accessLevel ||
                props.friend?.resonite?.accessLevel ||
                getResoniteSessionByHash(sessionHash)?.accessLevel ||
                ''
        ).trim();

        return formatResoniteWorldLabel(baseLocation, accessLevel);
    }

    const externalPresenceLine = computed(() => {
        const traveling = formatResonitePresenceLocation(String(props.friend?.ref?.traveling || '').trim());
        const rawLocation = String(props.friend?.ref?.location || '').trim();
        // 'offline' is a sentinel from contacts-only payloads — don't display it as a world name
        const location = rawLocation !== 'offline' ? formatResonitePresenceLocation(rawLocation) : '';
        const statusDescription = String(props.friend?.ref?.statusDescription || '').trim();
        const provider = String(props.friend?.provider || 'external').trim();

        return traveling || location || statusDescription || '';
    });
    const showResoniteProviderIcon = computed(() => {
        if (!props.friend?.isExternal) {
            return false;
        }

        const traveling = String(props.friend?.ref?.traveling || '').trim();
        const rawLocation = String(props.friend?.ref?.location || '').trim();
        return Boolean(traveling || (rawLocation && rawLocation !== 'offline'));
    });

    const epoch = computed(() =>
        isFriendTraveling.value ? props.friend?.ref?.$travelingToTime : props.friend?.ref?.$location_at
    );

    const locationProp = computed(() => props.friend?.ref?.location || '');
    const travelingProp = computed(() => props.friend?.ref?.travelingToLocation || '');

    // For Resonite (external) friends render colour tags; for others just escape the text.
    const renderedExternalPresenceLine = computed(() =>
        props.friend?.isExternal ? renderResoniteRichText(externalPresenceLine.value) : externalPresenceLine.value
    );
</script>
