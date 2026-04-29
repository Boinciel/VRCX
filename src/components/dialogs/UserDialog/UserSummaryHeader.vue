<template>
    <div style="display: flex">
        <div :style="mainImageContainerStyle">
            <img
                v-if="
                    !userDialog.loading &&
                    !profileImageError &&
                    (userDialog.ref.profilePicOverrideThumbnail || userDialog.ref.profilePicOverride)
                "
                class="cursor-pointer"
                :src="userDialog.ref.profilePicOverrideThumbnail || userDialog.ref.profilePicOverride"
                :style="mainImageStyle"
                @click="showFullscreenImageDialog(userDialog.ref.profilePicOverride)"
                @error="profileImageError = true"
                loading="lazy" />
            <img
                v-else-if="!userDialog.loading && !profileImageError && userDialog.ref.currentAvatarThumbnailImageUrl"
                class="cursor-pointer"
                :src="userDialog.ref.currentAvatarThumbnailImageUrl"
                :style="mainImageStyle"
                @click="showFullscreenImageDialog(userDialog.ref.currentAvatarImageUrl)"
                @error="profileImageError = true"
                loading="lazy" />
            <div
                v-else-if="!userDialog.loading"
                class="flex items-center justify-center bg-muted"
                :style="mainImageStyle">
                <Image class="size-8 text-muted-foreground" />
            </div>
        </div>
        <div class="ml-4" style="flex: 1; display: flex; align-items: flex-start">
            <div style="flex: 1">
                <div>
                    <TooltipWrapper v-if="userDialog.ref.status" side="top">
                        <template #content>
                            <span>{{ getUserStateText(userDialog.ref) }}</span>
                        </template>
                        <i class="x-user-status" :class="userStatusClass(userDialog.ref)"></i>
                    </TooltipWrapper>
                    <template v-if="userDialog.previousDisplayNames.length > 0">
                        <TooltipWrapper side="bottom">
                            <template #content>
                                <span>{{ t('dialog.user.previous_display_names') }}</span>
                                <div
                                    v-for="data in userDialog.previousDisplayNames"
                                    :key="data.displayName"
                                    placement="top">
                                    <span>{{ data.displayName }}</span>
                                    <span v-if="data.updated_at">
                                        &horbar; {{ formatDateFilter(data.updated_at, 'long') }}</span
                                    >
                                </div>
                            </template>
                            <ChevronDown class="inline-block" />
                        </TooltipWrapper>
                    </template>
                    <span
                        class="font-bold"
                        style="margin-left: 6px; margin-right: 6px; cursor: pointer"
                        v-text="resolvedDisplayName"
                        @click="copyUserDisplayName(resolvedDisplayName)"></span>
                    <TooltipWrapper v-if="userDialog.ref.pronouns" side="top" :content="t('dialog.user.pronouns')">
                        <span
                            class="x-grey font-mono text-xs"
                            style="margin-right: 6px"
                            v-text="userDialog.ref.pronouns"></span>
                    </TooltipWrapper>
                    <TooltipWrapper v-for="item in userDialog.ref.$languages" :key="item.key" side="top">
                        <template #content>
                            <span>{{ item.value }} ({{ item.key }})</span>
                        </template>
                        <span
                            class="flags"
                            :class="languageClass(item.key)"
                            style="display: inline-block; margin-right: 6px"></span>
                    </TooltipWrapper>
                    <template v-if="userDialog.ref.id === currentUser.id">
                        <br />
                        <span
                            class="x-grey font-mono text-xs"
                            style="margin-right: 8px; cursor: pointer"
                            v-text="currentUser.username"
                            @click="copyUserDisplayName(currentUser.username)"></span>
                    </template>
                </div>
                <div class="mt-2 flex items-center gap-1" v-show="!userDialog.loading">
                    <TooltipWrapper v-if="!isExternalUser" side="top" :content="t('dialog.user.tags.trust_level')">
                        <Badge variant="outline" class="name" :class="userDialog.ref.$trustClass">
                            <Shield class="h-4 w-4" /> {{ userDialog.ref.$trustLevel }}
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper v-if="isExternalUser" side="top" content="Resonite">
                        <Badge variant="outline" class="border-green-400! text-green-400">
                            <span class="provider-badge-icon provider-badge-icon--resonite"></span>
                            Resonite
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper
                        v-if="isExternalUser && resoniteProfile?.isVerified"
                        side="top"
                        content="Registered user on Resonite">
                        <Badge variant="outline" class="text-[#f63b64] border-[#f63b64]!">
                            <Check class="h-4 w-4" />
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper
                        v-if="userDialog.ref.ageVerified && userDialog.ref.ageVerificationStatus"
                        side="top"
                        :content="t('dialog.user.tags.age_verified')">
                        <Badge variant="outline" class="text-[#3b82f6] border-[#3b82f6]!">
                            <template v-if="userDialog.ref.ageVerificationStatus === '18+'">
                                <IdCard class="h-4 w-4" /> 18+
                            </template>
                            <template v-else>
                                <IdCard class="h-4 w-4" />
                            </template>
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper
                        v-if="userDialog.isFriend && userDialog.friend && userDialog.ref.$friendNumber"
                        side="top"
                        :content="t('dialog.user.tags.friend_number')">
                        <Badge variant="outline" class="text-amber-400 border-amber-400!">
                            <UserPlus class="h-4 w-4" />
                            {{ userDialog.ref.$friendNumber ? userDialog.ref.$friendNumber : '' }}
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper
                        v-if="userDialog.mutualFriendCount"
                        side="top"
                        :content="t('dialog.user.tags.mutual_friends')">
                        <Badge variant="outline" class="border-zinc-500/50! dark:border-zinc-400!">
                            <Users class="h-4 w-4" />
                            {{ userDialog.mutualFriendCount }}
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper
                        v-if="userDialog.ref.discordId"
                        side="top"
                        :content="t('dialog.user.tags.open_in_discord')">
                        <Badge
                            variant="outline"
                            class="text-[#7289da] border-[#7289da]! cursor-pointer"
                            @click="openDiscordProfile(userDialog.ref.discordId)">
                            <i class="ri-discord-line text-xs"></i>
                            {{ t('dialog.user.tags.discord') }}
                        </Badge>
                    </TooltipWrapper>
                    <Badge v-if="userDialog.ref.$isTroll" variant="outline" class="x-tag-troll">
                        {{ t('view.settings.appearance.user_colors.trust_levels.nuisance') }}
                    </Badge>
                    <Badge v-if="userDialog.ref.$isProbableTroll" variant="outline" class="x-tag-troll">
                        {{ t('view.favorite.avatars.almost_nuisance') }}
                    </Badge>
                    <Badge v-if="userDialog.ref.$isModerator" variant="outline" class="x-tag-vip">
                        {{ t('dialog.user.tags.vrchat_team') }}
                    </Badge>

                    <TooltipWrapper
                        v-if="isExternalUser && resoniteClientBadge"
                        side="top"
                        :content="resoniteClientBadge.tooltip">
                        <Badge variant="outline" :class="resoniteClientBadge.className">
                            <span
                                v-if="resoniteClientBadge.iconMaskClass"
                                :class="['provider-badge-icon', resoniteClientBadge.iconMaskClass]"></span>
                            <component
                                v-else-if="resoniteClientBadge.iconComponent"
                                :is="resoniteClientBadge.iconComponent"
                                class="m-0.5" />
                            <i v-else :class="[resoniteClientBadge.iconClass, 'text-xs']"></i>
                            {{ resoniteClientBadge.label }}
                        </Badge>
                    </TooltipWrapper>

                    <TooltipWrapper v-if="userDialog.ref.$platform === 'standalonewindows'" side="top" content="PC">
                        <Badge variant="outline" class="text-platform-pc border-platform-pc!">
                            <Monitor class="m-0.5 text-platform-pc" />
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper v-else-if="userDialog.ref.$platform === 'android'" side="top" content="Android">
                        <Badge variant="outline" class="text-platform-quest border-platform-quest!">
                            <Smartphone class="m-0.5 text-platform-quest" />
                        </Badge>
                    </TooltipWrapper>
                    <TooltipWrapper v-else-if="userDialog.ref.$platform === 'ios'" side="top" content="iOS">
                        <Badge variant="outline" class="text-platform-ios border-platform-ios">
                            <Apple class="m-0.5 text-platform-ios" />
                        </Badge>
                    </TooltipWrapper>
                    <Badge v-else-if="userDialog.ref.$platform" variant="outline" class="text-muted-foreground">
                        {{ userDialog.ref.$platform }}
                    </Badge>

                    <Badge
                        v-if="userDialog.ref.$customTag"
                        variant="outline"
                        class="name"
                        :style="{
                            color: userDialog.ref.$customTagColour,
                            'border-color': userDialog.ref.$customTagColour
                        }"
                        >{{ userDialog.ref.$customTag }}</Badge
                    >
                </div>
                <div class="mt-1">
                    <TooltipWrapper
                        v-for="badge in resoniteRenderedBadges"
                        :key="`resonite-${badge.id}`"
                        side="top"
                        :content="badge.label || badge.tag">
                        <div style="display: inline-block">
                            <img
                                v-if="badge.imageUrl"
                                class="cursor-pointer"
                                :src="badge.imageUrl"
                                :alt="badge.label"
                                style="
                                    flex: none;
                                    height: 32px;
                                    width: 32px;
                                    border-radius: var(--radius-sm);
                                    object-fit: cover;
                                    margin-top: 6px;
                                    margin-right: 6px;
                                "
                                loading="lazy"
                                decoding="async"
                                @click="showFullscreenImageDialog(badge.imageUrl)" />
                            <Badge
                                v-else
                                variant="outline"
                                class="inline-flex max-w-40 items-center truncate text-xs"
                                style="margin-top: 6px; margin-right: 6px">
                                {{ badge.label }}
                            </Badge>
                        </div>
                    </TooltipWrapper>
                    <TooltipWrapper v-for="badge in userDialog.ref.badges" :key="badge.badgeId" side="top">
                        <template #content>
                            <span>{{ badge.badgeName }}</span>
                            <span v-if="badge.hidden">&nbsp;(Hidden)</span>
                        </template>
                        <div style="display: inline-block">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <img
                                        class="cursor-pointer hover:grayscale-0"
                                        :src="badge.badgeImageUrl"
                                        style="
                                            flex: none;
                                            height: 32px;
                                            width: 32px;
                                            border-radius: var(--radius-sm);
                                            object-fit: cover;
                                            margin-top: 6px;
                                            margin-right: 6px;
                                        "
                                        :class="{ grayscale: badge.hidden }"
                                        loading="lazy" />
                                </PopoverTrigger>
                                <PopoverContent side="bottom" class="w-75">
                                    <img
                                        :src="badge.badgeImageUrl"
                                        :class="['cursor-pointer', 'max-w-full', 'max-h-full']"
                                        @click="showFullscreenImageDialog(badge.badgeImageUrl)"
                                        loading="lazy" />
                                    <br />
                                    <div style="display: block; width: 275px; word-break: normal">
                                        <span>{{ badge.badgeName }}</span>
                                        <br />
                                        <span class="x-grey text-xs">{{ badge.badgeDescription }}</span>
                                        <br />
                                        <span v-if="badge.assignedAt" class="x-grey font-mono text-xs">
                                            {{ t('dialog.user.badges.assigned') }}:
                                            {{ formatDateFilter(badge.assignedAt, 'long') }}
                                        </span>
                                        <template v-if="userDialog.id === currentUser.id">
                                            <br />
                                            <label class="inline-flex items-center gap-2" style="margin-top: 6px">
                                                <Checkbox
                                                    v-model="badge.hidden"
                                                    @update:modelValue="toggleBadgeVisibility(badge)" />
                                                <span>{{ t('dialog.user.badges.hidden') }}</span>
                                            </label>
                                            <br />
                                            <label class="inline-flex items-center gap-2">
                                                <Checkbox
                                                    v-model="badge.showcased"
                                                    @update:modelValue="toggleBadgeShowcased(badge)" />
                                                <span>{{ t('dialog.user.badges.showcased') }}</span>
                                            </label>
                                        </template>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </TooltipWrapper>
                </div>
                <div>
                    <span v-if="isExternalUser" class="text-xs" v-html="renderedStatusDescription"></span>
                    <span v-else class="text-xs" v-text="userDialog.ref.statusDescription"></span>
                </div>
            </div>

            <div v-if="!isExternalUser && userDialog.ref.userIcon" style="flex: none; margin-right: 8px">
                <img
                    v-if="!userIconError"
                    class="cursor-pointer"
                    :src="userImage(userDialog.ref, true, '256', true)"
                    style="flex: none; width: 120px; height: 120px; border-radius: var(--radius-xl); object-fit: cover"
                    @click="showFullscreenImageDialog(userDialog.ref.userIcon)"
                    @error="userIconError = true"
                    loading="lazy" />
                <div
                    v-else
                    class="flex items-center justify-center bg-muted"
                    style="width: 120px; height: 120px; border-radius: var(--radius-xl)">
                    <Image class="size-8 text-muted-foreground" />
                </div>
            </div>

            <UserActionDropdown v-if="!isExternalUser" class="ml-2 mt-12" :user-dialog-command="userDialogCommand" />
        </div>
    </div>
</template>

<script setup>
    import {
        Apple,
        Check,
        ChevronDown,
        IdCard,
        Image,
        Monitor,
        RectangleGoggles,
        Shield,
        Smartphone,
        UserPlus,
        Users
    } from 'lucide-vue-next';
    import { computed, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import {
        convertFileUrlToImageUrl,
        formatDateFilter,
        languageClass,
        openDiscordProfile
    } from '../../../shared/utils';
    import { renderResoniteRichText } from '../../../shared/utils/resoniteRichText';
    import { resolveResoniteBadges } from '../../../services/resoniteBadges';
    import { fetchResoniteInventoryRecordByPath } from '../../../services/resoniteInventory';
    import { useUserDisplay } from '../../../composables/useUserDisplay';
    import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
    import { useGalleryStore, useUserStore } from '../../../stores';
    import { Badge } from '../../ui/badge';
    import { Checkbox } from '../../ui/checkbox';

    import UserActionDropdown from './UserActionDropdown.vue';

    const props = defineProps({
        getUserStateText: {
            type: Function,
            required: true
        },

        copyUserDisplayName: {
            type: Function,
            required: true
        },
        toggleBadgeVisibility: {
            type: Function,
            required: true
        },
        toggleBadgeShowcased: {
            type: Function,
            required: true
        },
        userDialogCommand: {
            type: Function,
            required: true
        }
    });

    const { t } = useI18n();

    const { userDialog, currentUser } = storeToRefs(useUserStore());

    const { showFullscreenImageDialog } = useGalleryStore();
    const { userImage, userStatusClass } = useUserDisplay();

    const profileImageError = ref(false);
    const userIconError = ref(false);
    const isExternalUser = computed(
        () =>
            userDialog.value.isExternal ||
            String(userDialog.value.id || userDialog.value.ref?.id || '').startsWith('resonite:')
    );
    const mainImageContainerStyle = computed(() => ({
        flex: 'none',
        height: '120px',
        width: isExternalUser.value ? '120px' : '160px'
    }));
    const mainImageStyle = computed(() => ({
        height: '120px',
        width: isExternalUser.value ? '120px' : '160px',
        borderRadius: 'var(--radius-xl)',
        objectFit: 'cover'
    }));
    const resoniteProfile = computed(() => userDialog.value.ref?.resonite || {});
    const resolvedDisplayName = computed(() => {
        const dialogId = firstNonEmptyString(userDialog.value.id, userDialog.value.ref?.id);
        const rawDisplayName = firstNonEmptyString(userDialog.value.ref?.displayName);
        const resoniteUserId = firstNonEmptyString(resoniteProfile.value?.userId);
        const resoniteUsername = firstNonEmptyString(resoniteProfile.value?.username);

        if (!isExternalUser.value) {
            return firstNonEmptyString(rawDisplayName, dialogId);
        }

        if (rawDisplayName && rawDisplayName !== dialogId && rawDisplayName !== resoniteUserId) {
            return rawDisplayName;
        }

        return firstNonEmptyString(resoniteUsername, rawDisplayName, resoniteUserId, dialogId);
    });
    const renderedStatusDescription = computed(() =>
        renderResoniteRichText(String(userDialog.value.ref?.statusDescription || '').trim())
    );
    const resoniteClientBadge = computed(() => {
        if (!isExternalUser.value) {
            return null;
        }

        const outputDevice = firstNonEmptyString(
            resoniteProfile.value?.realtime?.outputDevice,
            resoniteProfile.value?.outputDevice
        );
        const appVersion = firstNonEmptyString(
            resoniteProfile.value?.realtime?.appVersion,
            resoniteProfile.value?.appVersion
        );
        const statusDescription = firstNonEmptyString(userDialog.value.ref?.statusDescription);
        const hint = `${outputDevice} ${statusDescription}`.trim().toLowerCase();

        let label = '';
        let className = 'text-muted-foreground';
        let iconClass = '';
        let iconComponent = null;
        let iconMaskClass = '';

        if (hint.includes('of recon')) {
            label = 'ReCon';
            className = 'border-sky-400! text-sky-400';
            iconMaskClass = 'provider-badge-icon--recon';
        } else if (hint.includes(' of vr') || hint.endsWith(' vr')) {
            label = 'VR';
            className = 'border-emerald-400! text-emerald-400';
            iconComponent = RectangleGoggles;
        } else if (hint.includes(' of screen') || hint.includes('screen')) {
            label = 'PC';
            className = 'border-platform-pc! text-platform-pc';
            iconComponent = Monitor;
        }

        if (!label) {
            return null;
        }

        return {
            label,
            className,
            iconClass,
            iconComponent,
            iconMaskClass,
            tooltip: [label, appVersion].filter(Boolean).join(' · ')
        };
    });
    const resoniteBaseBadges = computed(() =>
        isExternalUser.value
            ? resolveResoniteBadges({
                  tags: Array.isArray(resoniteProfile.value?.tags) ? resoniteProfile.value.tags : [],
                  displayBadges: Array.isArray(resoniteProfile.value?.profile?.displayBadges)
                      ? resoniteProfile.value.profile.displayBadges
                      : [],
                  registrationDate: firstNonEmptyString(resoniteProfile.value?.registrationDate)
              })
            : []
    );
    const resoniteRenderedBadges = ref([]);
    let resoniteBadgeResolutionRunId = 0;

    watch(
        [resoniteBaseBadges, () => firstNonEmptyString(resoniteProfile.value?.userId)],
        async ([baseBadges, resoniteUserId]) => {
            const resolutionRunId = ++resoniteBadgeResolutionRunId;
            resoniteRenderedBadges.value = baseBadges;

            if (!Array.isArray(baseBadges) || baseBadges.length === 0) {
                return;
            }

            const resolvedBadges = await Promise.all(
                baseBadges.map(async (badge) => {
                    if (badge?.imageUrl || !badge?.inventoryOwnerId || !badge?.inventoryPath) {
                        return badge;
                    }

                    try {
                        const record = await fetchResoniteInventoryRecordByPath({
                            userId: firstNonEmptyString(resoniteUserId, badge.inventoryOwnerId),
                            ownerId: badge.inventoryOwnerId,
                            path: badge.inventoryPath
                        });
                        const imageUrl = firstNonEmptyString(
                            record?.thumbnailUrl,
                            convertFileUrlToImageUrl(record?.assetUri)
                        );

                        if (!imageUrl) {
                            return badge;
                        }

                        return {
                            ...badge,
                            assetUri: firstNonEmptyString(badge.assetUri, record?.assetUri),
                            imageUrl,
                            isKnown: true
                        };
                    } catch {
                        return badge;
                    }
                })
            );

            if (resolutionRunId !== resoniteBadgeResolutionRunId) {
                return;
            }

            resoniteRenderedBadges.value = resolvedBadges;
        },
        { immediate: true }
    );

    watch(
        () => userDialog.value.id,
        () => {
            profileImageError.value = false;
            userIconError.value = false;
        }
    );

    const getUserStateText = props.getUserStateText;
    const copyUserDisplayName = props.copyUserDisplayName;
    const toggleBadgeVisibility = props.toggleBadgeVisibility;
    const toggleBadgeShowcased = props.toggleBadgeShowcased;
    const userDialogCommand = props.userDialogCommand;

    function firstNonEmptyString(...values) {
        for (const value of values) {
            const normalized = String(value || '').trim();
            if (normalized) {
                return normalized;
            }
        }

        return '';
    }
</script>

<style scoped>
    .provider-badge-icon {
        display: inline-block;
        width: 0.875rem;
        height: 0.875rem;
        flex: none;
        background-color: currentColor;
        mask-position: center;
        mask-repeat: no-repeat;
        mask-size: contain;
        -webkit-mask-position: center;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-size: contain;
    }

    .provider-badge-icon--resonite {
        mask-image: url(/images/resonite/resonite.svg);
        -webkit-mask-image: url(/images/resonite/resonite.svg);
    }

    .provider-badge-icon--recon {
        mask-image: url(/images/resonite/recon.svg);
        -webkit-mask-image: url(/images/resonite/recon.svg);
    }
</style>
