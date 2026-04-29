<template>
    <template v-if="isResoniteExternalUser || isFriendOnline(userDialog.friend) || currentUser.id === userDialog.id">
        <!-- ── Resonite external user: session info panel ── -->
        <div
            v-if="hasResoniteSessionPanel"
            class="mb-2 pb-2 border-b border-border"
            style="display: flex; flex-direction: column">
            <div class="flex items-center gap-2 text-muted-foreground" style="flex: none">
                <TooltipWrapper
                    v-if="resoniteHasActionableSession"
                    side="top"
                    :content="t('dialog.user.info.launch_invite_tooltip')">
                    <Button
                        class="rounded-full w-6 h-6 text-xs text-muted-foreground hover:text-foreground"
                        size="icon-sm"
                        variant="outline"
                        :disabled="!resoniteJoinUrl"
                        @click="openResoniteSession">
                        <LogIn class="h-4 w-4" />
                    </Button>
                </TooltipWrapper>

                <TooltipWrapper
                    v-if="resoniteHasActionableSession"
                    side="top"
                    :content="t('dialog.user.info.refresh_instance_info')">
                    <Button
                        class="rounded-full w-6 h-6 text-xs text-muted-foreground hover:text-foreground"
                        size="icon"
                        variant="outline"
                        :disabled="isRefreshingResoniteSession"
                        @click="refreshResoniteSessionInfo">
                        <Loader2 v-if="isRefreshingResoniteSession" class="h-4 w-4 animate-spin" />
                        <RefreshCw v-else class="h-4 w-4" />
                    </Button>
                </TooltipWrapper>

                <span v-if="resoniteHasActionableSession" class="flex items-center gap-0.5">
                    <UsersRound class="h-4 w-4" />
                    {{ resoniteUsersInWorldCount }}
                    <span v-if="resoniteSession?.maxUsers > 0">/{{ resoniteSession.maxUsers }}</span>
                </span>

                <TooltipWrapper
                    v-if="resoniteHasActionableSession"
                    side="top"
                    :content="t('dialog.user.info.instance_friends_tooltip')">
                    <span class="flex items-center gap-0.5">
                        <UserPlus2 class="h-4 w-4" />
                        {{ resoniteContactsInWorldCount }}
                    </span>
                </TooltipWrapper>
            </div>
            <div class="mt-2 flex items-center gap-2 text-sm" style="flex: none">
                <img
                    :src="resoniteProviderIconUrl"
                    alt="Resonite"
                    class="size-4 flex-none"
                    loading="lazy" />
                <span class="font-medium" v-html="renderResoniteRichText(resoniteSessionTitle)" />
            </div>
            <div v-if="resoniteSessionThumbnailUrl" class="mt-2" style="flex: none">
                <Avatar
                    class="cursor-pointer size-15! rounded-lg!"
                    @click="showFullscreenImageDialog(resoniteSessionThumbnailUrl)">
                    <AvatarImage :src="resoniteSessionThumbnailUrl" class="object-cover" />
                    <AvatarFallback class="rounded-lg!">
                        <Image class="size-5 text-muted-foreground" />
                    </AvatarFallback>
                </Avatar>
            </div>
            <!-- Session users grid (mirrors the VRChat instance users layout) -->
            <div
                v-if="resoniteSessionHost || resoniteSessionParticipantUsers.length > 0"
                class="flex flex-wrap items-start"
                style="flex: 1; margin-top: 8px; max-height: 150px; overflow: auto">
                <div
                    v-if="resoniteSessionHost"
                    class="box-border flex items-center p-1.5 text-[13px] w-[167px]"
                    :class="
                        resoniteSessionHost.userID
                            ? 'cursor-pointer hover:rounded-[25px_5px_5px_25px]'
                            : 'cursor-default'
                    "
                    @click="openResoniteSessionUserDialog(resoniteSessionHost)">
                    <div
                        class="relative inline-block flex-none size-9 mr-2.5"
                        :class="
                            resoniteSessionHost.friend?.ref
                                ? userStatusClass(resoniteSessionHost.friend.ref)
                                : 'x-user-status'
                        ">
                        <Avatar class="size-9">
                            <AvatarImage
                                v-if="resoniteSessionHost.avatarUrl"
                                :src="resoniteSessionHost.avatarUrl"
                                class="object-cover" />
                            <AvatarFallback>
                                <User class="size-4 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div class="flex-1 overflow-hidden">
                        <span
                            class="block truncate font-medium leading-[18px]"
                            :style="
                                resoniteSessionHost.friend?.ref
                                    ? { color: resoniteSessionHost.friend.ref?.$userColour }
                                    : {}
                            "
                            v-html="renderResoniteRichText(resoniteSessionHost.displayName)" />
                        <span
                            class="inline-flex items-center gap-1 rounded-full border border-amber-400/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                            <img
                                :src="resoniteHostBadge.imageUrl"
                                :alt="resoniteHostBadge.label || 'Resonite host badge'"
                                class="size-3 rounded-sm"
                                loading="lazy" />
                            {{ resoniteHostBadge.label || 'Host' }}
                        </span>
                    </div>
                </div>
                <div
                    v-for="su in resoniteSessionParticipantUsers"
                    :key="su.userID || su.username"
                    class="box-border flex items-center p-1.5 text-[13px] w-[167px]"
                    :class="su.userID ? 'cursor-pointer hover:rounded-[25px_5px_5px_25px]' : 'cursor-default'"
                    @click="openResoniteSessionUserDialog(su)">
                    <div
                        class="relative inline-block flex-none size-9 mr-2.5"
                        :class="su.friend?.ref ? userStatusClass(su.friend.ref) : 'x-user-status'">
                        <Avatar class="size-9">
                            <AvatarImage v-if="su.avatarUrl" :src="su.avatarUrl" class="object-cover" />
                            <AvatarFallback>
                                <User class="size-4 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div class="flex-1 overflow-hidden">
                        <span
                            class="block truncate font-medium leading-[18px]"
                            :style="su.friend?.ref ? { color: su.friend.ref?.$userColour } : {}"
                            v-html="renderResoniteRichText(su.displayName || su.username)" />
                        <span class="block truncate text-xs text-muted-foreground">
                            {{ su.isPresent ? 'Present' : 'Away' }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── VRChat user: existing instance panel ── -->
        <div
            v-else-if="!userDialog.isExternal && userDialog.ref.location"
            class="mb-2 pb-2 border-b border-border"
            style="display: flex; flex-direction: column">
            <div style="flex: none">
                <template v-if="isRealInstance(userDialog.$location?.tag)">
                    <InstanceActionBar
                        class="mb-1"
                        :location="userDialog.$location?.tag"
                        :shortname="userDialog.$location?.shortName"
                        :currentlocation="lastLocation.location"
                        :instance="userDialog.instance.ref"
                        :friendcount="userDialog.instance.friendCount"
                        :refresh-tooltip="t('dialog.user.info.refresh_instance_info')"
                        :on-refresh="() => refreshInstancePlayerCount(userDialog.$location?.tag)" />
                </template>
                <Location
                    class="text-sm"
                    :location="userDialog.ref.location"
                    :traveling="userDialog.ref.travelingToLocation" />
            </div>
            <div class="flex flex-wrap items-start" style="flex: 1; margin-top: 8px; max-height: 150px; overflow: auto">
                <div
                    v-if="userDialog.$location?.userId"
                    class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px] hover:rounded-[25px_5px_5px_25px]"
                    @click="showUserDialog(userDialog.$location?.userId)">
                    <template v-if="userDialog.$location?.user">
                        <div
                            class="relative inline-block flex-none size-9 mr-2.5"
                            :class="userStatusClass(userDialog.$location?.user)">
                            <Avatar class="size-9">
                                <AvatarImage :src="userImage(userDialog.$location?.user, true)" class="object-cover" />
                                <AvatarFallback>
                                    <User class="size-4 text-muted-foreground" />
                                </AvatarFallback>
                            </Avatar>
                        </div>
                        <div class="flex-1 overflow-hidden">
                            <span
                                class="block truncate font-medium leading-[18px]"
                                :style="{ color: userDialog.$location?.user?.$userColour }"
                                v-text="userDialog.$location?.user?.displayName"></span>
                            <span class="block truncate text-xs">{{ t('dialog.user.info.instance_creator') }}</span>
                        </div>
                    </template>
                    <span v-else v-text="userDialog.$location?.userId"></span>
                </div>
                <div
                    v-for="user in userDialog.users"
                    :key="user.id"
                    class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px] hover:rounded-[25px_5px_5px_25px]"
                    @click="showUserDialog(user.id)">
                    <div class="relative inline-block flex-none size-9 mr-2.5" :class="userStatusClass(user)">
                        <Avatar class="size-9">
                            <AvatarImage :src="userImage(user, true)" class="object-cover" />
                            <AvatarFallback>
                                <User class="size-4 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div class="flex-1 overflow-hidden">
                        <span
                            class="block truncate font-medium leading-[18px]"
                            :style="{ color: user.$userColour }"
                            v-text="user.displayName"></span>
                        <span v-if="user.location === 'traveling'" class="block truncate text-xs">
                            <Spinner class="inline-block mr-1" />
                            <Timer :epoch="user.$travelingToTime" />
                        </span>
                        <span v-else class="block truncate text-xs">
                            <Timer :epoch="user.$location_at" />
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </template>

    <div class="flex flex-wrap items-start px-2.5" style="max-height: none">
        <div
            v-if="userDialog.note && !hideUserNotes"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-pointer">
            <div class="flex-1 overflow-hidden" @click="isEditNoteAndMemoDialogVisible = true">
                <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.note') }}</span>
                <pre
                    class="text-xs font-[inherit]"
                    style="white-space: pre-wrap; margin: 0 0.5em 0 0; max-height: 210px; overflow-y: auto"
                    >{{ userDialog.note }}</pre
                >
            </div>
        </div>
        <div
            v-if="userDialog.memo && !hideUserMemos"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-pointer">
            <div class="flex-1 overflow-hidden" @click="isEditNoteAndMemoDialogVisible = true">
                <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.memo') }}</span>
                <pre
                    class="text-xs font-[inherit]"
                    style="white-space: pre-wrap; margin: 0 0.5em 0 0; max-height: 210px; overflow-y: auto"
                    >{{ userDialog.memo }}</pre
                >
            </div>
        </div>
        <div
            v-if="isResoniteExternalUser && resoniteProfileDescription"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-default">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">Resonite Description</span>
                <pre
                    class="text-xs font-[inherit]"
                    style="white-space: pre-wrap; margin: 0 0.5em 0 0; max-height: 210px; overflow-y: auto"
                    >{{ resoniteProfileDescription }}</pre
                >
            </div>
        </div>
        <div
            v-if="!isResoniteExternalUser"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-default">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">
                    {{
                        userDialog.id !== currentUser.id &&
                        userDialog.ref.profilePicOverride &&
                        userDialog.ref.currentAvatarImageUrl
                            ? t('dialog.user.info.avatar_info_last_seen')
                            : t('dialog.user.info.avatar_info')
                    }}
                    <TooltipWrapper
                        v-if="userDialog.ref.profilePicOverride && !userDialog.ref.currentAvatarImageUrl"
                        side="top"
                        :content="t('dialog.user.info.vrcplus_hides_avatar')">
                        <Info class="inline-block" />
                    </TooltipWrapper>
                </span>
                <div class="text-xs">
                    <AvatarInfo
                        :key="userDialog.id"
                        :imageurl="userDialog.ref.currentAvatarImageUrl"
                        :userid="userDialog.id"
                        :avatartags="userDialog.ref.currentAvatarTags"
                        style="display: inline-block" />
                </div>
            </div>
        </div>
        <div
            v-if="!isResoniteExternalUser"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-default">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]" style="margin-bottom: 6px">{{
                    t('dialog.user.info.represented_group')
                }}</span>
                <div
                    v-if="
                        userDialog.isRepresentedGroupLoading ||
                        (userDialog.representedGroup && userDialog.representedGroup.isRepresenting)
                    "
                    class="text-xs">
                    <div style="display: inline-block; flex: none; margin-right: 6px">
                        <Avatar
                            class="cursor-pointer size-15! rounded-lg!"
                            :style="{
                                background: userDialog.isRepresentedGroupLoading ? 'var(--muted)' : ''
                            }"
                            @click="showFullscreenImageDialog(userDialog.representedGroup.iconUrl)">
                            <AvatarImage
                                :src="userDialog.representedGroup.$thumbnailUrl"
                                @load="userDialog.isRepresentedGroupLoading = false"
                                @error="userDialog.isRepresentedGroupLoading = false" />
                            <AvatarFallback class="rounded-lg!">
                                <Image class="size-5 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <span
                        v-if="userDialog.representedGroup.isRepresenting"
                        style="vertical-align: top; cursor: pointer"
                        @click="showGroupDialog(userDialog.representedGroup.groupId)">
                        <span v-if="userDialog.representedGroup.ownerId === userDialog.id" style="margin-right: 6px"
                            >👑</span
                        >
                        <span style="margin-right: 6px" v-text="userDialog.representedGroup.name"></span>
                        <span>({{ userDialog.representedGroup.memberCount }})</span>
                    </span>
                </div>
                <div v-else class="text-xs">-</div>
            </div>
        </div>
        <div
            v-if="!isResoniteExternalUser"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-default">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.bio') }}</span>
                <pre
                    class="text-xs truncate font-[inherit]"
                    style="white-space: pre-wrap; margin: 0 0.5em 0 0; max-height: 210px; overflow-y: auto"
                    >{{ bioCache.translated || userDialog.ref.bio || '-' }}</pre
                >
                <div style="float: right">
                    <Button
                        v-if="translationApi && userDialog.ref.bio"
                        class="w-3 h-6 text-xs mr-0.5"
                        size="icon-sm"
                        variant="ghost"
                        @click="translateBio">
                        <Spinner v-if="translateLoading" class="size-1" />
                        <Languages v-else class="h-3 w-3" />
                    </Button>
                    <Button
                        class="w-3 h-6 text-xs"
                        size="icon-sm"
                        variant="ghost"
                        v-if="userDialog.id === currentUser.id"
                        style="margin-left: 6px; padding: 0"
                        @click="$emit('showBioDialog')"
                        ><Pencil class="h-3 w-3" />
                    </Button>
                </div>
                <div style="margin-top: 6px" class="flex items-center">
                    <TooltipWrapper v-for="(link, index) in userDialog.ref.bioLinks" :key="index">
                        <template #content>
                            <span v-text="link"></span>
                        </template>
                        <!-- onerror="this.onerror=null;this.class='icon-error'" -->
                        <img
                            :src="getFaviconUrl(link)"
                            style="
                                width: 16px;
                                height: 16px;
                                vertical-align: middle;
                                margin-right: 6px;
                                cursor: pointer;
                            "
                            @click.stop="openExternalLink(link)"
                            loading="lazy" />
                    </TooltipWrapper>
                </div>
            </div>
        </div>
        <template v-if="showEncounterStats">
            <div class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">
                        {{ t('dialog.user.info.last_seen') }}
                    </span>
                    <span class="block truncate text-xs">{{ formatDateFilter(userDialog.lastSeen, 'long') }}</span>
                </div>
            </div>

            <div
                class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
                @click="showPreviousInstancesListDialog(userDialog.ref)">
                <div class="flex-1 overflow-hidden">
                    <div
                        class="block truncate font-medium leading-[18px]"
                        style="display: flex; justify-content: space-between; align-items: center">
                        <div>
                            {{ t('dialog.user.info.join_count') }}
                        </div>

                        <TooltipWrapper side="top" :content="t('dialog.user.info.open_previous_instance')">
                            <MoreHorizontal style="margin-right: 16px" />
                        </TooltipWrapper>
                    </div>
                    <span v-if="userDialog.joinCount === 0" class="block truncate text-xs">-</span>
                    <span v-else class="block truncate text-xs" v-text="userDialog.joinCount"></span>
                </div>
            </div>

            <div class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">
                        {{ t('dialog.user.info.time_together') }}
                    </span>
                    <span v-if="userDialog.timeSpent === 0" class="block truncate text-xs">-</span>
                    <span v-else class="block truncate text-xs">{{ timeToText(userDialog.timeSpent) }}</span>
                </div>
            </div>
        </template>
        <template v-else>
            <TooltipWrapper
                :disabled="currentUser.id !== userDialog.id"
                side="top"
                :content="t('dialog.user.info.open_previous_instance')">
                <div
                    class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
                    @click="showPreviousInstancesListDialog(userDialog.ref)">
                    <div class="flex-1 overflow-hidden">
                        <span class="block truncate font-medium leading-[18px]">
                            {{ t('dialog.user.info.play_time') }}
                        </span>
                        <span v-if="userDialog.timeSpent === 0" class="block truncate text-xs">-</span>
                        <span v-else class="block truncate text-xs">{{ timeToText(userDialog.timeSpent) }}</span>
                    </div>
                </div>
            </TooltipWrapper>
        </template>
        <div class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
            <TooltipWrapper :side="currentUser.id !== userDialog.id ? 'bottom' : 'top'">
                <template #content>
                    <span>{{ formatDateFilter(userOnlineForTimestamp(userDialog), 'short') }}</span>
                </template>
                <div class="flex-1 overflow-hidden">
                    <span
                        v-if="userDialog.ref.state === 'online' && userDialog.ref.$online_for"
                        class="block truncate font-medium leading-[18px]">
                        {{ t('dialog.user.info.online_for') }}
                    </span>
                    <span v-else class="block truncate font-medium leading-[18px]">
                        {{ t('dialog.user.info.offline_for') }}
                    </span>
                    <span class="block truncate text-xs">{{ userOnlineFor(userDialog.ref) }}</span>
                </div>
            </TooltipWrapper>
        </div>
        <div class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
            <TooltipWrapper :side="currentUser.id !== userDialog.id ? 'bottom' : 'top'">
                <template #content>
                    <span
                        >{{ t('dialog.user.info.last_login') }}
                        {{ formatDateFilter(userDialog.ref.last_login, 'long') }}</span
                    >
                    <br />
                    <span
                        >{{ t('dialog.user.info.last_activity') }}
                        {{ formatDateFilter(userDialog.ref.last_activity, 'long') }}</span
                    >
                </template>
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">{{
                        t('dialog.user.info.last_activity')
                    }}</span>
                    <span v-if="userDialog.ref.last_activity" class="block truncate text-xs">{{
                        timeToText(Date.now() - Date.parse(userDialog.ref.last_activity))
                    }}</span>
                    <span v-else class="block truncate text-xs">-</span>
                </div>
            </TooltipWrapper>
        </div>
        <div v-if="userJoinDate" class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.date_joined') }}</span>
                <span class="block truncate text-xs" v-text="userJoinDate"></span>
            </div>
        </div>
        <div v-if="showFriendedInfo" class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
            <TooltipWrapper side="top" :disabled="userDialog.dateFriendedInfo.length < 2">
                <template #content>
                    <template v-for="ref in userDialog.dateFriendedInfo" :key="ref.type">
                        <span>{{ ref.type }}: {{ formatDateFilter(ref.created_at, 'long') }}</span
                        ><br />
                    </template>
                </template>
                <div class="flex-1 overflow-hidden">
                    <span v-if="userDialog.unFriended" class="block truncate font-medium leading-[18px]">
                        {{ t('dialog.user.info.unfriended') }}
                    </span>
                    <span v-else class="block truncate font-medium leading-[18px]">
                        {{ t('dialog.user.info.friended') }}
                    </span>
                    <span class="block truncate text-xs">{{ formatDateFilter(userDialog.dateFriended, 'long') }}</span>
                </div>
            </TooltipWrapper>
        </div>
        <template v-if="currentUser.id === userDialog.id && !isResoniteExternalUser">
            <div
                class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
                @click="toggleAvatarCopying">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">{{
                        t('dialog.user.info.avatar_cloning')
                    }}</span>
                    <span v-if="currentUser.allowAvatarCopying" class="block truncate text-xs">{{
                        t('dialog.user.info.avatar_cloning_allow')
                    }}</span>
                    <span v-else class="block truncate text-xs">{{ t('dialog.user.info.avatar_cloning_deny') }}</span>
                </div>
            </div>
            <div
                class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
                @click="toggleAllowBooping">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.booping') }}</span>
                    <span v-if="currentUser.isBoopingEnabled" class="block truncate text-xs">{{
                        t('dialog.user.info.avatar_cloning_allow')
                    }}</span>
                    <span v-else class="block truncate text-xs">{{ t('dialog.user.info.avatar_cloning_deny') }}</span>
                </div>
            </div>
            <div
                class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
                @click="toggleSharedConnectionsOptOut">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">{{
                        t('dialog.user.info.show_mutual_friends')
                    }}</span>
                    <span v-if="!currentUser.hasSharedConnectionsOptOut" class="block truncate text-xs">{{
                        t('dialog.user.info.avatar_cloning_allow')
                    }}</span>
                    <span v-else class="block truncate text-xs">{{ t('dialog.user.info.avatar_cloning_deny') }}</span>
                </div>
            </div>
            <div
                class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
                @click="toggleDiscordFriendsOptOut">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">{{
                        t('dialog.user.info.show_discord_connections')
                    }}</span>
                    <span v-if="!currentUser.hasDiscordFriendsOptOut" class="block truncate text-xs">{{
                        t('dialog.user.info.avatar_cloning_allow')
                    }}</span>
                    <span v-else class="block truncate text-xs">{{ t('dialog.user.info.avatar_cloning_deny') }}</span>
                </div>
            </div>
        </template>
        <template v-else-if="!isResoniteExternalUser">
            <div class="box-border flex items-center p-1.5 text-[13px] cursor-default w-[167px]">
                <div class="flex-1 overflow-hidden">
                    <span class="block truncate font-medium leading-[18px]">{{
                        t('dialog.user.info.avatar_cloning')
                    }}</span>
                    <span v-if="userDialog.ref.allowAvatarCopying" class="block truncate text-xs">{{
                        t('dialog.user.info.avatar_cloning_allow')
                    }}</span>
                    <span v-else class="block truncate text-xs">{{ t('dialog.user.info.avatar_cloning_deny') }}</span>
                </div>
            </div>
        </template>
        <div
            v-if="userDialog.ref.id === currentUser.id"
            class="box-border flex items-center p-1.5 text-[13px] cursor-pointer w-[167px]"
            @click="getVRChatCredits()">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">{{
                    t('view.profile.profile.vrchat_credits')
                }}</span>
                <span class="block truncate text-xs">{{ vrchatCredit ?? t('view.profile.profile.refresh') }}</span>
            </div>
        </div>
        <div
            v-if="userDialog.ref.id === currentUser.id && currentUser.homeLocation"
            class="box-border flex items-center p-1.5 text-[13px] w-full cursor-pointer"
            @click="showWorldDialog(currentUser.homeLocation)">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.home_location') }}</span>
                <span class="block truncate text-xs">
                    <span v-text="userDialog.$homeLocationName"></span>
                    <Button class="rounded-full ml-1 text-xs" size="icon-sm" variant="ghost" @click.stop="resetHome()"
                        ><Trash2 class="h-4 w-4" />
                    </Button>
                </span>
            </div>
        </div>
        <div class="box-border flex items-center p-1.5 text-[13px] w-full cursor-default">
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium leading-[18px]">{{ t('dialog.user.info.id') }}</span>
                <span class="block truncate text-xs">
                    {{ displayUserId }}
                    <TooltipWrapper side="top" :content="t('dialog.user.info.id_tooltip')">
                        <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                                <Button class="rounded-full ml-1 text-xs" size="icon-sm" variant="ghost" @click.stop
                                    ><Copy class="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem @click="copyUserId(displayUserId)">
                                    {{ t('dialog.user.info.copy_id') }}
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="copyUserURL(userDialog.id)">
                                    {{ t('dialog.user.info.copy_url') }}
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="copyUserDisplayName(userDialog.ref.displayName)">
                                    {{ t('dialog.user.info.copy_display_name') }}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TooltipWrapper>
                </span>
            </div>
        </div>
    </div>
    <EditNoteAndMemoDialog v-model:visible="isEditNoteAndMemoDialogVisible" />
</template>

<script setup>
    import {
        Copy,
        Image,
        Info,
        Languages,
        Loader2,
        LogIn,
        MoreHorizontal,
        Pencil,
        RefreshCw,
        Trash2,
        User,
        UserPlus2,
        UsersRound
    } from 'lucide-vue-next';
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger
    } from '@/components/ui/dropdown-menu';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { computed, ref, watch } from 'vue';
    import { Button } from '@/components/ui/button';
    import { Spinner } from '@/components/ui/spinner';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import {
        copyToClipboard,
        formatDateFilter,
        getFaviconUrl,
        isFriendOnline,
        isRealInstance,
        openExternalLink,
        timeToText,
        userOnlineFor,
        userOnlineForTimestamp
    } from '../../../shared/utils';
    import { stripResonitePrefix } from '../../../shared/utils/resonite';
    import { renderResoniteRichText } from '../../../shared/utils/resoniteRichText';
    import { formatResoniteWorldLabel } from '../../../shared/utils/resoniteWorldLabel';
    import { convertFileUrlToImageUrl } from '../../../shared/utils/common';
    import { resolveResoniteBadges } from '../../../services/resoniteBadges';
    import { fetchResoniteUserProfiles } from '../../../services/resoniteFriends';
    import {
        getResoniteSessionByHash,
        refreshResoniteSessionByHash,
        resoniteSessionCacheVersion
    } from '../../../services/resoniteRealtime';
    import { useUserDisplay } from '../../../composables/useUserDisplay';
    import { refreshInstancePlayerCount } from '../../../coordinators/instanceCoordinator';
    import {
        useAdvancedSettingsStore,
        useAppearanceSettingsStore,
        useFriendStore,
        useGalleryStore,
        useInstanceStore,
        useLocationStore,
        useModalStore,
        useUserStore
    } from '../../../stores';
    import { showWorldDialog } from '../../../coordinators/worldCoordinator';
    import { queryRequest, userRequest } from '../../../api';

    import InstanceActionBar from '../../InstanceActionBar.vue';
    import { showSeededResoniteUserDialog, showUserDialog } from '../../../coordinators/userCoordinator';
    import { showGroupDialog } from '../../../coordinators/groupCoordinator';

    import EditNoteAndMemoDialog from './EditNoteAndMemoDialog.vue';

    defineEmits(['showBioDialog']);

    const { t } = useI18n();

    const modalStore = useModalStore();
    const instanceStore = useInstanceStore();

    const { hideUserNotes, hideUserMemos } = storeToRefs(useAppearanceSettingsStore());
    const { bioLanguage, translationApi, translationApiType, resoniteApiKey } = storeToRefs(useAdvancedSettingsStore());
    const { translateText } = useAdvancedSettingsStore();
    const { userDialog, currentUser } = storeToRefs(useUserStore());
    const { toggleSharedConnectionsOptOut, toggleDiscordFriendsOptOut } = useUserStore();
    const { friends } = storeToRefs(useFriendStore());

    const { lastLocation } = storeToRefs(useLocationStore());
    const { showFullscreenImageDialog } = useGalleryStore();
    const { userImage, userStatusClass } = useUserDisplay();
    let lastResoniteVisibleUserProfilesRequestId = 0;

    // ── Resonite session info ──────────────────────────────────────────────────

    const isResoniteExternalUser = computed(
        () =>
            userDialog.value.isExternal &&
            String(userDialog.value.id || userDialog.value.ref?.id || '').startsWith('resonite:')
    );
    const displayUserId = computed(() => {
        const rawId = firstNonEmptyString(userDialog.value.id, userDialog.value.ref?.id);

        if (!isResoniteExternalUser.value) {
            return rawId;
        }

        return stripResonitePrefix(rawId) || rawId;
    });
    const resoniteProviderIconUrl = '/images/resonite/resonite_color.svg';

    const hasResoniteSessionPanel = computed(
        () => isResoniteExternalUser.value && Boolean(resoniteSessionTitle.value)
    );

    const isCurrentDialogSelf = computed(() => {
        if (currentUser.value.id === userDialog.value.id) {
            return true;
        }

        if (!isResoniteExternalUser.value) {
            return false;
        }

        const dialogUserId = stripResonitePrefix(firstNonEmptyString(userDialog.value.id, userDialog.value.ref?.id));
        if (!dialogUserId) {
            return false;
        }

        const presence = currentUser.value?.$resonitePresence || {};
        return [presence.linkedUserId, presence.linkedContactId]
            .map((candidateId) => stripResonitePrefix(candidateId))
            .filter(Boolean)
            .includes(dialogUserId);
    });

    /** Full session object from the Resonite API, resolved when the session hash is known. */
    const resoniteSession = computed(() => {
        if (!isResoniteExternalUser.value) return null;
        void resoniteSessionCacheVersion.value;
        const hash =
            userDialog.value.ref?.resonite?.currentSessionHash ||
            userDialog.value.ref?.resonite?.realtime?.currentSessionHash ||
            '';
        return hash ? getResoniteSessionByHash(hash) : null;
    });

    const resonitePresenceLocation = computed(() =>
        String(
            userDialog.value.ref?.resonite?.locationName ||
                userDialog.value.ref?.resonite?.currentSessionName ||
                ''
        )
            .trim()
            .toLowerCase()
    );

    const resoniteHasActionableSession = computed(() => {
        if (!isResoniteExternalUser.value) {
            return false;
        }

        const hasKnownSession = Boolean(
            String(
                userDialog.value.ref?.resonite?.currentSessionHash ||
                    userDialog.value.ref?.resonite?.realtime?.currentSessionHash ||
                    resoniteSession.value?.sessionId ||
                    ''
            ).trim()
        );

        const state = String(userDialog.value.friend?.state || userDialog.value.ref?.state || '')
            .trim()
            .toLowerCase();

        if (state === 'offline' && !hasKnownSession) {
            return false;
        }

        if (
            resonitePresenceLocation.value === 'private' ||
            String(resoniteSession.value?.accessLevel || '')
                .trim()
                .toLowerCase() === 'private'
        ) {
            return false;
        }

        return Boolean(resoniteSessionTitle.value || hasKnownSession);
    });

    /** Resonite session title formatted like "World - Contacts+". */
    const resoniteSessionTitle = computed(() => {
        return formatResoniteWorldLabel(
            String(
                resoniteSession.value?.name ||
                    resoniteSession.value?.sessionName ||
                    resoniteSession.value?.locationName ||
                    resoniteSession.value?.worldName ||
                    resoniteSession.value?.world?.name ||
                    userDialog.value.ref?.resonite?.locationName ||
                    userDialog.value.ref?.resonite?.currentSessionName ||
                    ''
            ).trim(),
            resoniteSession.value?.accessLevel
        );
    });

    /** Preferred session thumbnail URL from Resonite session payload. */
    const resoniteSessionThumbnailUrl = computed(() =>
        String(
            resoniteSession.value?.thumbnailUrl ||
                resoniteSession.value?.thumbnailURL ||
                resoniteSession.value?.world?.thumbnailUrl ||
                resoniteSession.value?.world?.thumbnailURL ||
                ''
        ).trim()
    );

    const resoniteHostBadge = Object.freeze(
        resolveResoniteBadges({
            tags: ['host'],
            displayBadges: [],
            registrationDate: ''
        })[0] || { label: 'Host', imageUrl: '' }
    );

    const resoniteVisibleUserProfiles = ref(new Map());

    const resoniteVisibleUserIds = computed(() => {
        const session = resoniteSession.value;
        if (!session) {
            return [];
        }

        return [
            ...new Set(
                [
                    String(session.hostUserId || '').trim(),
                    ...(Array.isArray(session.sessionUsers) ? session.sessionUsers : [])
                        .map((sessionUser) => String(sessionUser?.userID || sessionUser?.id || '').trim())
                        .filter(Boolean)
                ].filter(Boolean)
            )
        ];
    });

    const resoniteProfile = computed(() => userDialog.value.ref?.resonite || {});

    const resoniteProfileDescription = computed(() =>
        String(resoniteProfile.value?.profile?.description || resoniteProfile.value?.profile?.tagline || '').trim()
    );

    const showEncounterStats = computed(() => {
        if (isCurrentDialogSelf.value) {
            return false;
        }

        return Boolean(
            String(userDialog.value.lastSeen || '').trim() ||
            Number(userDialog.value.joinCount || 0) > 0 ||
            Number(userDialog.value.timeSpent || 0) > 0
        );
    });

    const showFriendedInfo = computed(() => {
        if (isCurrentDialogSelf.value) {
            return false;
        }

        if (isResoniteExternalUser.value) {
            return false;
        }

        return Boolean(String(userDialog.value.dateFriended || '').trim());
    });

    const userJoinDate = computed(() =>
        isResoniteExternalUser.value
            ? formatDateFilter(String(resoniteProfile.value?.registrationDate || '').trim(), 'date')
            : String(userDialog.value.ref?.date_joined || '').trim()
    );

    watch(
        [isResoniteExternalUser, resoniteVisibleUserIds, resoniteApiKey],
        async ([nextIsResoniteExternalUser, nextVisibleUserIds]) => {
            const requestId = ++lastResoniteVisibleUserProfilesRequestId;

            if (!nextIsResoniteExternalUser || !nextVisibleUserIds.length) {
                resoniteVisibleUserProfiles.value = new Map();
                return;
            }

            const profilesByUserId = await fetchResoniteUserProfiles(nextVisibleUserIds, {
                apiKey: resoniteApiKey.value
            });

            if (requestId !== lastResoniteVisibleUserProfilesRequestId) {
                return;
            }

            resoniteVisibleUserProfiles.value = profilesByUserId;
        },
        {
            immediate: true
        }
    );

    function getResoniteFriendByUserId(rawId) {
        const normalizedId = String(rawId || '').trim();
        if (!normalizedId) {
            return null;
        }

        return friends.value.get(`resonite:${normalizedId}`) || friends.value.get(normalizedId) || null;
    }

    function getResoniteVisibleUserProfile(rawId) {
        const normalizedId = String(rawId || '').trim();
        if (!normalizedId) {
            return null;
        }

        return resoniteVisibleUserProfiles.value.get(normalizedId) || null;
    }

    /**
     * Merged list of session users from the Resonite API, with friend references
     * cross-linked so known contacts can be clicked through to their user dialog.
     * The `displayName` on each entry is the name that should be rendered (with
     * Resonite colour tags); for known friends the friend's own displayName is
     * preferred so we get their correct colour styling.
     */
    const resoniteSessionUsers = computed(() => {
        const session = resoniteSession.value;
        if (!session?.sessionUsers?.length) return [];

        return session.sessionUsers.map((su) => {
            const rawId = String(su.userID || su.id || '').trim();
            const friend = getResoniteFriendByUserId(rawId);
            const profile = getResoniteVisibleUserProfile(rawId);
            return {
                userID: rawId,
                username: su.username || su.displayName || rawId,
                displayName: friend?.name || su.username || su.displayName || profile?.username || rawId,
                isPresent: Boolean(su.isPresent),
                avatarUrl: firstNonEmptyString(
                    friend?.ref?.profileImageUrl,
                    friend?.ref?.userIcon,
                    convertFileUrlToImageUrl(profile?.profile?.iconUrl)
                ),
                friend,
                profile
            };
        });
    });

    const resoniteSessionHost = computed(() => {
        const session = resoniteSession.value;
        if (!session) {
            return null;
        }

        const hostUserId = String(session.hostUserId || '').trim();
        const hostSessionUser = resoniteSessionUsers.value.find(
            (sessionUser) => String(sessionUser.userID || '').trim() === hostUserId
        );
        const friend = getResoniteFriendByUserId(hostUserId);
        const profile = getResoniteVisibleUserProfile(hostUserId);
        const displayName = String(
            hostSessionUser?.displayName || friend?.name || session.hostUsername || profile?.username || hostUserId
        ).trim();

        if (!displayName) {
            return null;
        }

        return {
            userID: hostUserId,
            displayName,
            avatarUrl: firstNonEmptyString(
                hostSessionUser?.avatarUrl,
                friend?.ref?.profileImageUrl,
                friend?.ref?.userIcon,
                convertFileUrlToImageUrl(profile?.profile?.iconUrl)
            ),
            isPresent: Boolean(hostSessionUser?.isPresent),
            friend: hostSessionUser?.friend || friend,
            profile: hostSessionUser?.profile || profile
        };
    });

    const resoniteSessionParticipantUsers = computed(() => {
        const hostUserId = String(resoniteSessionHost.value?.userID || '').trim();
        const participants = hostUserId
            ? resoniteSessionUsers.value.filter((sessionUser) => String(sessionUser.userID || '').trim() !== hostUserId)
            : resoniteSessionUsers.value.slice();

        return participants.sort((left, right) => {
            const leftRank = left.friend ? 0 : 1;
            const rightRank = right.friend ? 0 : 1;
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }

            return String(left.displayName || left.username || left.userID || '').localeCompare(
                String(right.displayName || right.username || right.userID || '')
            );
        });
    });

    /** Current users in session. */
    const resoniteUsersInWorldCount = computed(() => {
        if (!resoniteSession.value) {
            return 0;
        }
        const joinedUsers = Number(resoniteSession.value.joinedUsers);
        if (Number.isFinite(joinedUsers) && joinedUsers > 0) {
            return joinedUsers;
        }
        const totalActiveUsers = Number(resoniteSession.value.totalActiveUsers);
        if (Number.isFinite(totalActiveUsers) && totalActiveUsers > 0) {
            return totalActiveUsers;
        }
        return resoniteSessionUsers.value.length;
    });

    /** Contacts/friends currently in session. */
    const resoniteContactsInWorldCount = computed(() => {
        const countedUserIds = new Set();
        let count = 0;

        const maybeCountSessionUser = (sessionUser) => {
            const sessionUserId = String(sessionUser?.userID || '').trim();
            if (
                !sessionUser?.friend ||
                !sessionUser?.isPresent ||
                !sessionUserId ||
                countedUserIds.has(sessionUserId)
            ) {
                return;
            }

            countedUserIds.add(sessionUserId);
            count += 1;
        };

        maybeCountSessionUser(resoniteSessionHost.value);
        for (const sessionUser of resoniteSessionParticipantUsers.value) {
            maybeCountSessionUser(sessionUser);
        }

        return count;
    });

    /** Preferred join URL from sessionURLs, with a session-id fallback when the API omits deeplinks. */
    const resoniteJoinUrl = computed(() => {
        const urls = Array.isArray(resoniteSession.value?.sessionURLs) ? resoniteSession.value.sessionURLs : [];
        const explicitUrl =
            urls.map((url) => String(url || '').trim()).find((url) => /^resonite:|^https?:\/\//i.test(url)) || '';
        if (explicitUrl) {
            return explicitUrl;
        }

        const sessionId = String(resoniteSession.value?.sessionId || '').trim();
        if (sessionId) {
            return `resonite://session/${encodeURIComponent(sessionId)}`;
        }

        const sessionHash = String(
            userDialog.value.ref?.resonite?.currentSessionHash ||
                userDialog.value.ref?.resonite?.realtime?.currentSessionHash ||
                ''
        ).trim();
        return sessionHash ? `resonite://session/${encodeURIComponent(sessionHash)}` : '';
    });

    const isRefreshingResoniteSession = ref(false);

    async function refreshResoniteSessionInfo() {
        if (isRefreshingResoniteSession.value) {
            return;
        }
        isRefreshingResoniteSession.value = true;
        try {
            const resonite = userDialog.value.ref?.resonite || {};
            const sessionHash = String(
                resonite.currentSessionHash || resonite.realtime?.currentSessionHash || ''
            ).trim();
            if (sessionHash) {
                await refreshResoniteSessionByHash({
                    sessionHash,
                    userId: resonite.userId || userDialog.value.id,
                    apiKey: resoniteApiKey.value,
                    force: true
                });
            }
        } finally {
            isRefreshingResoniteSession.value = false;
        }
    }

    function openResoniteSession() {
        if (!resoniteJoinUrl.value) {
            toast.error('No Resonite session URL available for this world.');
            return;
        }
        AppApi.OpenLink(resoniteJoinUrl.value);
    }

    function openResoniteSessionUserDialog(sessionUser) {
        const userId = String(sessionUser?.userID || '').trim();
        if (!userId) {
            return;
        }

        const displayName = firstNonEmptyString(
            sessionUser?.displayName,
            sessionUser?.username,
            sessionUser?.profile?.username,
            userId
        );
        const avatarUrl = firstNonEmptyString(
            sessionUser?.avatarUrl,
            convertFileUrlToImageUrl(sessionUser?.profile?.profile?.iconUrl)
        );
        const accessLevel = firstNonEmptyString(
            resoniteSession.value?.accessLevel,
            userDialog.value.ref?.resonite?.accessLevel,
            userDialog.value.ref?.resonite?.realtime?.accessLevel
        );
        const locationName = firstNonEmptyString(
            formatResoniteWorldLabel(resoniteSession.value?.name, accessLevel),
            formatResoniteWorldLabel(userDialog.value.ref?.resonite?.locationName, accessLevel),
            formatResoniteWorldLabel(userDialog.value.ref?.resonite?.currentSessionName, accessLevel),
            userDialog.value.ref?.resonite?.locationName,
            userDialog.value.ref?.resonite?.currentSessionName
        );
        const sessionHash = firstNonEmptyString(
            userDialog.value.ref?.resonite?.currentSessionHash,
            userDialog.value.ref?.resonite?.realtime?.currentSessionHash
        );
        const sessionId = firstNonEmptyString(resoniteSession.value?.sessionId);
        const sessionName = firstNonEmptyString(
            formatResoniteWorldLabel(resoniteSession.value?.name, accessLevel),
            formatResoniteWorldLabel(userDialog.value.ref?.resonite?.currentSessionName, accessLevel),
            locationName
        );
        const sessionHostUserId = String(resoniteSession.value?.hostUserId || '').trim();
        const seededState = sessionUser?.isPresent ? 'online' : sessionHostUserId === userId ? 'offline' : '';
        const seededStatus = sessionUser?.isPresent ? 'active' : '';

        showSeededResoniteUserDialog({
            userId,
            displayName,
            username: firstNonEmptyString(sessionUser?.profile?.username, sessionUser?.username, displayName),
            normalizedUsername: String(sessionUser?.profile?.normalizedUsername || '').trim(),
            registrationDate: String(sessionUser?.profile?.registrationDate || '').trim(),
            isVerified: Boolean(sessionUser?.profile?.isVerified),
            tags: Array.isArray(sessionUser?.profile?.tags) ? sessionUser.profile.tags : [],
            state: seededState,
            status: seededStatus,
            isPresent: Boolean(sessionUser?.isPresent),
            avatarUrl,
            locationName,
            sessionHash,
            sessionName,
            sessionId,
            accessLevel,
            friendCtx: sessionUser?.friend || null,
            tagline: String(sessionUser?.profile?.profile?.tagline || '').trim(),
            description: String(sessionUser?.profile?.profile?.description || '').trim()
        });
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

    const bioCache = ref({
        userId: null,
        translated: null
    });

    const isEditNoteAndMemoDialogVisible = ref(false);
    const vrchatCredit = ref(null);
    const translateLoading = ref(false);

    watch(
        () => userDialog.value.loading,
        () => {
            if (userDialog.value.visible) {
                if (userDialog.value.id !== bioCache.value.userId) {
                    bioCache.value = {
                        userId: null,
                        translated: null
                    };
                }
            }
        }
    );

    /**
     *
     */
    function onTabActivated() {
        if (currentUser.value.id === userDialog.value.id && vrchatCredit.value === null) {
            getVRChatCredits();
        }
    }

    /**
     *
     */
    function showEditNoteAndMemoDialog() {
        isEditNoteAndMemoDialogVisible.value = true;
    }

    /**
     *
     */
    async function translateBio() {
        if (translateLoading.value) {
            return;
        }
        const bio = userDialog.value.ref.bio;
        if (!bio) {
            return;
        }

        const targetLang = bioLanguage.value;

        if (bioCache.value.userId !== userDialog.value.id) {
            bioCache.value.userId = userDialog.value.id;
            bioCache.value.translated = null;
        }

        if (bioCache.value.translated) {
            bioCache.value.translated = null;
            return;
        }

        translateLoading.value = true;
        try {
            const providerLabel = translationApiType.value === 'openai' ? 'OpenAI' : 'Google';
            const translated = await translateText(`${bio}\n\nTranslated by ${providerLabel}`, targetLang);
            if (!translated) {
                throw new Error('No translation returned');
            }

            bioCache.value.translated = translated;
        } catch (err) {
            console.error('Translation failed:', err);
        } finally {
            translateLoading.value = false;
        }
    }

    /**
     *
     * @param userRef
     */
    function showPreviousInstancesListDialog(userRef) {
        instanceStore.showPreviousInstancesListDialog('user', userRef);
    }

    /**
     *
     */
    function toggleAvatarCopying() {
        userRequest.saveCurrentUser({
            allowAvatarCopying: !currentUser.value.allowAvatarCopying
        });
    }

    /**
     *
     */
    function toggleAllowBooping() {
        userRequest.saveCurrentUser({
            isBoopingEnabled: !currentUser.value.isBoopingEnabled
        });
    }

    /**
     *
     */
    function resetHome() {
        modalStore
            .confirm({
                description: t('confirm.command_question', {
                    command: t('dialog.user.actions.reset_home')
                }),
                title: t('confirm.title')
            })
            .then(({ ok }) => {
                if (!ok) return;
                userRequest
                    .saveCurrentUser({
                        homeLocation: ''
                    })
                    .then((args) => {
                        toast.success(t('message.user.home_reset'));
                        return args;
                    });
            })
            .catch(() => {});
    }

    /**
     *
     * @param userId
     */
    function copyUserId(userId) {
        copyToClipboard(userId, t('message.user.id_copied'));
    }

    /**
     *
     * @param userId
     */
    function copyUserURL(userId) {
        copyToClipboard(`https://vrchat.com/home/user/${userId}`, t('message.user.url_copied'));
    }

    /**
     *
     * @param displayName
     */
    function copyUserDisplayName(displayName) {
        copyToClipboard(displayName, t('message.user.display_name_copied'));
    }

    /**
     *
     */
    function getVRChatCredits() {
        queryRequest.fetch('vrchatCredits').then((args) => (vrchatCredit.value = args.json?.balance));
    }

    defineExpose({
        onTabActivated,
        showEditNoteAndMemoDialog
    });
</script>
