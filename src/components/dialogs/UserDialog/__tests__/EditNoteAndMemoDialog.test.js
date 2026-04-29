import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

const userDialogRef = ref({
    id: 'usr_1',
    note: 'n1',
    memo: 'm1',
    isExternal: false,
    ref: { id: 'usr_1', note: 'n1' }
});

const mocks = vi.hoisted(() => ({
    saveUserMemo: vi.fn(),
    saveNote: vi.fn(async () => ({
        json: { note: 'n1' },
        params: { targetUserId: 'usr_1', note: 'n1' }
    })),
    getUser: vi.fn()
}));

vi.mock('pinia', async (i) => ({ ...(await i()), storeToRefs: (s) => s }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('../../../../stores', () => ({
    useUserStore: () => ({
        userDialog: userDialogRef,
        cachedUsers: new Map([['usr_1', { note: 'n1' }]])
    }),
    useAppearanceSettingsStore: () => ({
        hideUserNotes: ref(false),
        hideUserMemos: ref(false)
    })
}));
vi.mock('../../../../api', () => ({
    miscRequest: { saveNote: (...a) => mocks.saveNote(...a) },
    userRequest: { getUser: (...a) => mocks.getUser(...a) }
}));
vi.mock('../../../../coordinators/memoCoordinator', () => ({
    saveUserMemo: (...a) => mocks.saveUserMemo(...a)
}));
vi.mock('../../../../shared/utils', () => ({ replaceBioSymbols: (s) => s }));
vi.mock('@/components/ui/dialog', () => ({
    Dialog: { template: '<div><slot /></div>' },
    DialogContent: { template: '<div><slot /></div>' },
    DialogHeader: { template: '<div><slot /></div>' },
    DialogTitle: { template: '<div><slot /></div>' },
    DialogFooter: { template: '<div><slot /></div>' }
}));
vi.mock('@/components/ui/button', () => ({
    Button: {
        emits: ['click'],
        template:
            '<button data-testid="btn" @click="$emit(\'click\')"><slot /></button>'
    }
}));
vi.mock('@/components/ui/input-group', () => ({
    InputGroupTextareaField: {
        props: ['modelValue'],
        emits: ['update:modelValue'],
        template: '<textarea />'
    }
}));

import EditNoteAndMemoDialog from '../EditNoteAndMemoDialog.vue';

describe('EditNoteAndMemoDialog.vue', () => {
    beforeEach(() => {
        mocks.saveUserMemo.mockClear();
        mocks.saveNote.mockClear();
        userDialogRef.value = {
            id: 'usr_1',
            note: 'n1',
            memo: 'm1',
            isExternal: false,
            ref: { id: 'usr_1', note: 'n1' }
        };
    });

    it('emits close and saves memo on confirm', async () => {
        const wrapper = mount(EditNoteAndMemoDialog, {
            props: { visible: false }
        });
        await wrapper.setProps({ visible: true });
        const buttons = wrapper.findAll('[data-testid="btn"]');
        await buttons[1].trigger('click');

        expect(mocks.saveUserMemo).toHaveBeenCalledWith('usr_1', 'm1');
        expect(wrapper.emitted('update:visible')).toEqual([[false]]);
    });

    it('hides the note field and skips VRChat note saves for external users', async () => {
        userDialogRef.value = {
            id: 'resonite:U-1',
            note: 'n1',
            memo: 'm1',
            isExternal: true,
            ref: { id: 'resonite:U-1', note: 'n1' }
        };

        const wrapper = mount(EditNoteAndMemoDialog, {
            props: { visible: false }
        });
        await wrapper.setProps({ visible: true });

        expect(wrapper.text()).not.toContain('dialog.user.info.note');
        expect(wrapper.text()).toContain('dialog.user.info.memo');

        const buttons = wrapper.findAll('[data-testid="btn"]');
        await buttons[1].trigger('click');

        expect(mocks.saveNote).not.toHaveBeenCalled();
        expect(mocks.saveUserMemo).toHaveBeenCalledWith('resonite:U-1', 'm1');
    });
});
