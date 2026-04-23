import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    t: vi.fn((key) => key),
    onLaunch: vi.fn(),
    onShowInfo: vi.fn(),
    onDelete: vi.fn(),
    onDeletePrompt: vi.fn(),
    shiftHeld: { value: false, __v_isRef: true }
}));

vi.mock('../../../ui/button', () => ({
    Button: 'button'
}));

vi.mock('../../DisplayName.vue', () => ({
    default: 'DisplayName'
}));

vi.mock('../../Location.vue', () => ({
    default: 'Location'
}));

vi.mock('../../LocationWorld.vue', () => ({
    default: 'LocationWorld'
}));

vi.mock('../../../../plugins', () => ({
    i18n: {
        global: {
            t: (key) => mocks.t(key)
        }
    }
}));

vi.mock('../../../../shared/utils', () => ({
    formatDateFilter: (value, format) => `${format}:${value}`
}));

vi.mock('../../../../shared/utils/resoniteRichText', () => ({
    renderResoniteRichText: (value) => `<span>${value}</span>`
}));

vi.mock('lucide-vue-next', () => ({
    ArrowUpDown: 'ArrowUpDown',
    Info: 'Info',
    LogIn: 'LogIn',
    Trash2: 'Trash2'
}));

import { createPreviousInstancesColumns } from '../previousInstancesColumns.jsx';

function createElement(type, props, ...children) {
    return {
        type,
        props: props ?? {},
        children: children.flat()
    };
}

function findNode(node, predicate) {
    if (!node) return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const result = findNode(item, predicate);
            if (result) return result;
        }
        return null;
    }

    if (predicate(node)) return node;
    if (!node.children) return null;
    return findNode(node.children, predicate);
}

describe('previousInstancesColumns', () => {
    beforeEach(() => {
        globalThis.React = { createElement };
        mocks.onLaunch.mockReset();
        mocks.onShowInfo.mockReset();
        mocks.onDelete.mockReset();
        mocks.onDeletePrompt.mockReset();
        mocks.shiftHeld.value = false;
    });

    test('renders Resonite user rows without VRChat launch affordances and opens history by raw location', () => {
        const columns = createPreviousInstancesColumns('user', {
            shiftHeld: mocks.shiftHeld,
            currentUserId: 'usr_me',
            onLaunch: mocks.onLaunch,
            onShowInfo: mocks.onShowInfo,
            onDelete: mocks.onDelete,
            onDeletePrompt: mocks.onDeletePrompt
        });
        const worldColumn = columns.find((column) => column.id === 'world');
        const creatorColumn = columns.find((column) => column.id === 'creator');
        const actionsColumn = columns.find((column) => column.id === 'actions');
        const row = {
            original: {
                provider: 'resonite',
                location:
                    '<color=blue>TMSC<color=purple> Zutyo <color=red>Home',
                worldName:
                    '<color=blue>TMSC<color=purple> Zutyo <color=red>Home',
                groupName: 'Crew'
            }
        };

        const worldCell = worldColumn.cell({ row });
        const locationButton = findNode(
            worldCell,
            (node) =>
                node.type === 'button' &&
                typeof node.props?.onClick === 'function'
        );
        locationButton.props.onClick();

        const creatorCell = creatorColumn.cell({ row });
        expect(
            findNode(creatorCell, (node) => node.children === '-')
        ).not.toBeNull();

        const actionsCell = actionsColumn.cell({ row });
        expect(
            findNode(actionsCell, (node) => node.type === 'LogIn')
        ).toBeNull();
        const infoButton = findNode(
            actionsCell,
            (node) =>
                node.type === 'button' &&
                typeof node.props?.onClick === 'function' &&
                findNode(node.children, (child) => child?.type === 'Info')
        );
        infoButton.props.onClick({ stopPropagation: vi.fn() });

        expect(mocks.onShowInfo).toHaveBeenNthCalledWith(
            1,
            '<color=blue>TMSC<color=purple> Zutyo <color=red>Home'
        );
        expect(mocks.onShowInfo).toHaveBeenNthCalledWith(
            2,
            '<color=blue>TMSC<color=purple> Zutyo <color=red>Home'
        );
        expect(mocks.onLaunch).not.toHaveBeenCalled();
    });
});
