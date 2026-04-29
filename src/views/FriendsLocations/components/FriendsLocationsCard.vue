<template>
    <UserContextMenu :user-id="friend.id" :state="friend.state" :location="friend.ref?.location">
        <Card
            class="friend-card x-hover-card hover:bg-muted relative"
            :style="cardStyle"
            @click="showUserDialog(friend.id)">
            <div class="friend-card__header grid items-center mb-1.75">
                <div class="relative inline-block flex-none size-9 mr-2.5">
                    <Avatar class="size-full rounded-full">
                        <AvatarImage :src="userImage(friend.ref, true)" class="object-cover" />
                        <AvatarFallback>
                            <User class="text-muted-foreground" :size="Math.max(16, 20 * cardScale)" />
                        </AvatarFallback>
                    </Avatar>
                </div>
                <span
                    class="friend-card__status-dot absolute rounded-full pointer-events-none"
                    :class="statusDotClass"></span>
                <div
                    class="friend-card__name font-semibold overflow-hidden text-ellipsis whitespace-nowrap"
                    :title="friend.name">
                    {{ friend.name }}
                </div>
            </div>
            <div class="friend-card__body grid">
                <div
                    class="friend-card__signature flex items-center overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground"
                    :title="friend.ref?.statusDescription">
                    <Pencil v-if="friend.ref?.statusDescription" class="h-3.5 w-3.5 mr-0.5" style="opacity: 0.7" />
                    {{ friend.ref?.statusDescription || '&nbsp;' }}
                </div>
                <div
                    v-if="displayInstanceInfo"
                    @click.stop
                    class="friend-card__world flex items-center justify-start box-border max-w-full min-w-0 overflow-hidden"
                    :title="displayLocationTitle">
                    <template v-if="isResoniteExternalFriend">
                        <img
                            :src="resoniteProviderIconUrl"
                            alt="Resonite"
                            class="friend-card__provider-icon mr-1.5 size-4 flex-none" />
                        <div class="friend-card__location flex w-full overflow-hidden wrap-break-word text-center">
                            <span class="x-location__text w-full" v-html="renderedExternalLocation"></span>
                        </div>
                    </template>
                    <Location
                        v-else
                        class="friend-card__location flex w-full overflow-hidden wrap-break-word text-center"
                        :location="friend.ref?.location"
                        :traveling="friend.ref?.travelingToLocation"
                        enable-context-menu
                        link />
                </div>
            </div>
        </Card>
    </UserContextMenu>
</template>

<script setup>
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Card } from '@/components/ui/card';
    import { Pencil, User } from 'lucide-vue-next';
    import { computed } from 'vue';

    import { useUserDisplay } from '../../../composables/useUserDisplay';

    import Location from '../../../components/Location.vue';
    import UserContextMenu from '../../../components/UserContextMenu.vue';
    import { showUserDialog } from '../../../coordinators/userCoordinator';
    import { getResoniteSessionByHash } from '../../../services/resoniteRealtime';
    import { renderResoniteRichText } from '../../../shared/utils/resoniteRichText';
    import { formatResoniteWorldLabel } from '../../../shared/utils/resoniteWorldLabel';

    const { userImage, userStatusClass } = useUserDisplay();
    const resoniteProviderIconUrl = '/images/resonite/resonite_color.svg';

    const props = defineProps({
        friend: {
            type: Object,
            required: true
        },
        cardScale: {
            type: Number,
            default: 1
        },
        displayInstanceInfo: {
            type: Boolean,
            default: true
        },
        cardSpacing: {
            type: Number,
            default: 1
        }
    });

    const cardStyle = computed(() => ({
        '--card-scale': props.cardScale,
        '--card-spacing': props.cardSpacing,
        cursor: 'pointer',
        padding: `${8 * props.cardScale}px`,
        paddingBottom: `${6 * props.cardScale}px !important`
    }));

    const statusDotClass = computed(() => {
        const status = userStatusClass(props.friend.ref, props.friend.pendingOffline);

        if (status?.['resonite-online']) {
            return 'friend-card__status-dot--resonite-online';
        }
        if (status?.['resonite-sociable']) {
            return 'friend-card__status-dot--resonite-sociable';
        }
        if (status?.['resonite-away']) {
            return 'friend-card__status-dot--resonite-away';
        }
        if (status?.['resonite-busy']) {
            return 'friend-card__status-dot--resonite-busy';
        }
        if (status?.['resonite-invisible']) {
            return 'friend-card__status-dot--resonite-invisible';
        }

        if (status?.online) {
            return 'friend-card__status-dot--online';
        }
        if (status?.['active-joinme']) {
            return 'friend-card__status-dot--active-joinme';
        }
        if (status?.['active-askme']) {
            return 'friend-card__status-dot--active-askme';
        }
        if (status?.['active-busy']) {
            return 'friend-card__status-dot--active-busy';
        }
        if (status?.active) {
            return 'friend-card__status-dot--active';
        }
        if (status?.joinme) {
            return 'friend-card__status-dot--joinme';
        }
        if (status?.askme) {
            return 'friend-card__status-dot--askme';
        }
        if (status?.busy) {
            return 'friend-card__status-dot--busy';
        }
        if (status?.offline) {
            return 'friend-card__status-dot--offline';
        }

        return 'friend-card__status-dot--hidden';
    });

    const isResoniteExternalFriend = computed(
        () =>
            props.friend?.isExternal === true ||
            props.friend?.provider === 'resonite' ||
            String(props.friend?.id || '').startsWith('resonite:')
    );

    const resoniteAccessLevel = computed(() => {
        const sessionHash = String(
            props.friend?.ref?.resonite?.currentSessionHash || props.friend?.resonite?.currentSessionHash || ''
        ).trim();

        return String(
            props.friend?.ref?.resonite?.accessLevel ||
                props.friend?.resonite?.accessLevel ||
                getResoniteSessionByHash(sessionHash)?.accessLevel ||
                ''
        ).trim();
    });

    const externalLocationText = computed(() => {
        if (!isResoniteExternalFriend.value) {
            return '';
        }

        const baseLocation =
            String(props.friend?.ref?.resonite?.locationName || '').trim() ||
            String(props.friend?.ref?.resonite?.currentSessionName || '').trim() ||
            String(props.friend?.ref?.location || '').trim();

        if (!baseLocation || baseLocation === 'offline') {
            return '';
        }

        if (baseLocation.toLowerCase() === 'private') {
            return 'Private';
        }

        return formatResoniteWorldLabel(baseLocation, resoniteAccessLevel.value);
    });

    const renderedExternalLocation = computed(() => renderResoniteRichText(externalLocationText.value));

    const displayLocationTitle = computed(() => externalLocationText.value || props.friend?.worldName || '');
</script>

<style scoped>
    .friend-card {
        --card-scale: 1;
        --card-spacing: 1;
        gap: calc(14px * var(--card-scale) * var(--card-spacing));
        max-width: var(--friend-card-target-width, 220px);
        min-width: var(--friend-card-min-width, 220px);
    }

    .friend-card__header {
        grid-template-columns: auto minmax(0, 1fr);
        gap: calc(10px * var(--card-scale) * var(--card-spacing));
    }

    .friend-card__status-dot {
        top: calc(8px * var(--card-scale));
        right: calc(8px * var(--card-scale));
        inline-size: calc(12px * var(--card-scale));
        block-size: calc(12px * var(--card-scale));
    }

    .friend-card__status-dot--hidden {
        display: none;
    }

    .friend-card__status-dot--online {
        background: var(--status-online);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-online) 40%, transparent);
    }

    .friend-card__status-dot--active {
        background: transparent;
        border: calc(2px * var(--card-scale)) solid var(--status-online);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-online) 40%, transparent);
    }

    .friend-card__status-dot--active-joinme {
        background: transparent;
        border: calc(2px * var(--card-scale)) solid var(--status-joinme);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-joinme) 40%, transparent);
    }

    .friend-card__status-dot--active-askme {
        background: transparent;
        border: calc(2px * var(--card-scale)) solid var(--status-askme);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-askme) 40%, transparent);
    }

    .friend-card__status-dot--active-busy {
        background: transparent;
        border: calc(2px * var(--card-scale)) solid var(--status-busy);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-busy) 40%, transparent);
    }

    .friend-card__status-dot--joinme {
        background: var(--status-joinme);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-joinme) 40%, transparent);
    }

    .friend-card__status-dot--busy {
        background: var(--status-busy);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-busy) 40%, transparent);
    }

    .friend-card__status-dot--askme {
        background: var(--status-askme);
        box-shadow: 0 0 calc(8px * var(--card-scale)) color-mix(in oklch, var(--status-askme) 40%, transparent);
    }

    .friend-card__status-dot--offline {
        background: var(--status-offline-card);
    }

    .friend-card__status-dot--resonite-online,
    .friend-card__status-dot--resonite-sociable,
    .friend-card__status-dot--resonite-away,
    .friend-card__status-dot--resonite-busy,
    .friend-card__status-dot--resonite-invisible {
        background-color: transparent;
        background-position: center;
        background-repeat: no-repeat;
        background-size: contain;
        box-shadow: none;
    }

    .friend-card__status-dot--resonite-online {
        background-image: url('/images/resonite/presence_online.svg');
    }

    .friend-card__status-dot--resonite-sociable {
        background-image: url('/images/resonite/presence_sociable.svg');
    }

    .friend-card__status-dot--resonite-away {
        background-image: url('/images/resonite/presence_away.svg');
    }

    .friend-card__status-dot--resonite-busy {
        background-image: url('/images/resonite/presence_busy.svg');
    }

    .friend-card__status-dot--resonite-invisible {
        background-image: url('/images/resonite/presence_invisible.svg');
    }

    .friend-card__body {
        gap: calc(8px * var(--card-scale) * var(--card-spacing));
    }

    .friend-card__name {
        font-size: calc(13px * var(--card-scale));
    }

    .friend-card__signature {
        font-size: calc(12px * var(--card-scale));
        padding: calc(7px * var(--card-scale)) calc(8px * var(--card-scale));
        line-height: 1.4;
        gap: calc(4px * var(--card-scale));
    }

    .friend-card__signature :deep(svg) {
        margin-top: calc(1px * var(--card-scale));
    }

    .friend-card__world {
        min-height: calc(24px * var(--card-scale));
        padding: calc(7px * var(--card-scale)) calc(8px * var(--card-scale));
        border-radius: calc(var(--radius-lg) * var(--card-scale));
        font-size: calc(12px * var(--card-scale));
        line-height: 1.3;
    }

    :global(html.dark) .friend-card__world,
    :global(:root.dark) .friend-card__world,
    :global(:root[data-theme='dark']) .friend-card__world {
        color: var(--color-zinc-300);
    }

    .friend-card__location {
        max-height: calc(36px * var(--card-scale));
        white-space: normal;
    }

    .friend-card__provider-icon {
        align-self: flex-start;
        margin-top: calc(1px * var(--card-scale));
    }

    .friend-card__location :deep(.x-location__text) {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        text-overflow: ellipsis;
    }

    .friend-card__location :deep(.x-location__text:only-child) {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(24px * var(--card-scale));
    }

    .friend-card__location :deep(.x-location__text:only-child span) {
        display: block;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .friend-card__location :deep(.x-location__meta) {
        display: none;
    }

    .friend-card__location :deep(.flags) {
        scale: calc(1 * var(--card-scale));
        filter: brightness(1.05);
    }
</style>
