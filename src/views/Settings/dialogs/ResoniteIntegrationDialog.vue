<template>
    <Dialog :open="isResoniteIntegrationDialogVisible" @update:open="(open) => (open ? null : closeDialog())">
        <DialogContent class="max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('dialog.resonite_integration.header') }}</DialogTitle>
            </DialogHeader>

            <div class="flex flex-col gap-4">
                <div class="text-xs">{{ t('dialog.resonite_integration.description') }}</div>

                <div class="space-y-3 rounded-md border p-3">
                    <div class="text-xs font-medium">{{ t('dialog.resonite_integration.login_section') }}</div>

                    <div class="space-y-2">
                        <Label for="resonite-username">{{ t('dialog.resonite_integration.username') }}</Label>
                        <Input
                            id="resonite-username"
                            v-model="localUsername"
                            type="text"
                            autocomplete="username"
                            :placeholder="t('dialog.resonite_integration.username_placeholder')"
                            class="w-full" />
                    </div>

                    <div class="space-y-2">
                        <Label for="resonite-password">{{ t('dialog.resonite_integration.password') }}</Label>
                        <Input
                            id="resonite-password"
                            v-model="localPassword"
                            type="password"
                            autocomplete="current-password"
                            :placeholder="t('dialog.resonite_integration.password_placeholder')"
                            class="w-full" />
                    </div>

                    <div class="space-y-2">
                        <Label for="resonite-totp">{{ t('dialog.resonite_integration.totp') }}</Label>
                        <Input
                            id="resonite-totp"
                            v-model="localTotp"
                            type="text"
                            inputmode="numeric"
                            maxlength="8"
                            :placeholder="t('dialog.resonite_integration.totp_placeholder')"
                            class="w-full" />
                    </div>

                    <Button
                        class="w-full"
                        variant="secondary"
                        :disabled="isAuthenticating"
                        @click="loginAndGenerateApiKey">
                        {{
                            isAuthenticating
                                ? t('dialog.resonite_integration.login_in_progress')
                                : t('dialog.resonite_integration.login_generate_key')
                        }}
                    </Button>
                </div>

                <div class="space-y-2">
                    <Label for="endpoint">{{ t('dialog.resonite_integration.endpoint') }}</Label>
                    <Input
                        id="endpoint"
                        v-model="localEndpoint"
                        type="url"
                        :placeholder="t('dialog.resonite_integration.endpoint_placeholder')"
                        class="w-full" />
                </div>

                <div class="space-y-2">
                    <Label for="api-key">{{ t('dialog.resonite_integration.api_key') }}</Label>
                    <InputGroupTextareaField
                        id="api-key"
                        v-model="localApiKey"
                        :placeholder="t('dialog.resonite_integration.api_key_placeholder')"
                        :rows="2"
                        show-count />
                </div>

                <div class="space-y-2">
                    <Label for="refresh-interval">{{ t('dialog.resonite_integration.refresh_interval') }} (s)</Label>
                    <Input
                        id="refresh-interval"
                        v-model.number="localRefreshSeconds"
                        type="number"
                        min="30"
                        max="3600"
                        class="w-full" />
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="resetDialog">
                    {{ t('dialog.button.cancel') }}
                </Button>
                <Button @click="saveResoniteConfig">
                    {{ t('dialog.button.save') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { ref, watch } from 'vue';
    import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { InputGroupTextareaField } from '@/components/ui/input-group';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { useAdvancedSettingsStore } from '../../../stores';
    import { useResoniteCredentialsStore } from '../../../stores/resoniteCredentials';
    import { calculateResoniteTokenExpiry, createResoniteSession } from '../../../services/resoniteAuth';

    const advancedSettingsStore = useAdvancedSettingsStore();
    const resoniteCredentialsStore = useResoniteCredentialsStore();

    const { resoniteFriendsEndpoint, resoniteApiKey, resoniteRefreshSeconds } = storeToRefs(advancedSettingsStore);

    const { setResoniteFriendsEndpoint, setResoniteApiKey, setResoniteRefreshSeconds } = advancedSettingsStore;

    const { t } = useI18n();

    defineProps({
        isResoniteIntegrationDialogVisible: {
            type: Boolean,
            default: false
        }
    });

    const emit = defineEmits(['update:isResoniteIntegrationDialogVisible']);

    const localEndpoint = ref('');
    const localApiKey = ref('');
    const localRefreshSeconds = ref(300);
    const localUsername = ref('');
    const localPassword = ref('');
    const localTotp = ref('');
    const isAuthenticating = ref(false);

    const resoniteContactsEndpointTemplate = 'https://api.resonite.com/users/{userId}/contacts';

    watch(
        () => resoniteFriendsEndpoint.value,
        (newValue) => {
            localEndpoint.value = newValue;
        },
        { immediate: true }
    );

    watch(
        () => resoniteApiKey.value,
        (newValue) => {
            localApiKey.value = newValue;
        },
        { immediate: true }
    );

    watch(
        () => resoniteRefreshSeconds.value,
        (newValue) => {
            localRefreshSeconds.value = newValue;
        },
        { immediate: true }
    );

    async function saveResoniteConfig() {
        if (!localEndpoint.value) {
            toast.error(t('dialog.resonite_integration.error_endpoint_required'));
            return;
        }

        try {
            new URL(localEndpoint.value);
        } catch {
            toast.error(t('dialog.resonite_integration.error_invalid_url'));
            return;
        }

        if (localRefreshSeconds.value < 30 || localRefreshSeconds.value > 3600) {
            toast.error(t('dialog.resonite_integration.error_invalid_refresh_interval'));
            return;
        }

        await setResoniteFriendsEndpoint(localEndpoint.value);
        await setResoniteApiKey(localApiKey.value);
        await setResoniteRefreshSeconds(localRefreshSeconds.value);

        toast.success(t('dialog.resonite_integration.saved'));
        closeDialog();
    }

    async function loginAndGenerateApiKey() {
        if (isAuthenticating.value) {
            return;
        }

        if (!localUsername.value.trim() || !localPassword.value) {
            toast.error(t('dialog.resonite_integration.error_credentials_required'));
            return;
        }

        isAuthenticating.value = true;
        try {
            const rememberMe = true;
            const session = await createResoniteSession({
                username: localUsername.value,
                password: localPassword.value,
                totp: localTotp.value,
                rememberMe
            });

            if (!localEndpoint.value.trim()) {
                localEndpoint.value = resoniteContactsEndpointTemplate.replace('{userId}', session.userId);
            }

            localApiKey.value = session.apiKey;

            await setResoniteFriendsEndpoint(localEndpoint.value);
            await setResoniteApiKey(localApiKey.value);
            await setResoniteRefreshSeconds(localRefreshSeconds.value);

            await resoniteCredentialsStore.saveResoniteCredentialsForCurrentUser({
                username: localUsername.value,
                password: localPassword.value,
                apiKey: session.apiKey,
                tokenExpiresAt: calculateResoniteTokenExpiry(rememberMe),
                rememberMe
            });

            localPassword.value = '';
            localTotp.value = '';

            toast.success(t('dialog.resonite_integration.login_saved'));
        } catch (error) {
            console.error('[ResoniteIntegration] Login flow failed', {
                message: error?.message,
                status: error?.status,
                responseData: error?.responseData
            });
            const errorMessage = String(error?.message || '');
            const responseData = String(error?.responseData || '');
            const status = Number(error?.status || 0);
            if (status === 401 || status === 403 || errorMessage.includes('401') || errorMessage.includes('403')) {
                toast.error(t('dialog.resonite_integration.error_invalid_credentials'));
            } else {
                const detail = (responseData || errorMessage || '').trim();
                const detailSnippet = detail ? detail.slice(0, 140) : '';

                if (status) {
                    toast.error(
                        detailSnippet
                            ? `${t('dialog.resonite_integration.error_login_failed')} (HTTP ${status}): ${detailSnippet}`
                            : `${t('dialog.resonite_integration.error_login_failed')} (HTTP ${status})`
                    );
                } else {
                    toast.error(
                        detailSnippet
                            ? `${t('dialog.resonite_integration.error_login_failed')}: ${detailSnippet}`
                            : t('dialog.resonite_integration.error_login_failed')
                    );
                }
            }
        } finally {
            isAuthenticating.value = false;
        }
    }

    function resetDialog() {
        localEndpoint.value = resoniteFriendsEndpoint.value;
        localApiKey.value = resoniteApiKey.value;
        localRefreshSeconds.value = resoniteRefreshSeconds.value;
        localPassword.value = '';
        localTotp.value = '';
        closeDialog();
    }

    function closeDialog() {
        emit('update:isResoniteIntegrationDialogVisible', false);
    }
</script>
