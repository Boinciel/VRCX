import webApiService from './webapi';
import { useAdvancedSettingsStore } from '../stores';
import {
    buildResoniteAuthorizationHeader,
    ensureResoniteSessionIsFresh
} from './resoniteAuth';
import { convertFileUrlToImageUrl } from '../shared/utils/common';

export const RESONITE_INVENTORY_ROOT_PATH = 'Inventory';
const RESONITE_INVENTORY_OWNER_CACHE_TTL_MS = 10 * 60 * 1000;
const resoniteInventoryOwnerCache = new Map();

export async function fetchResoniteInventoryRecords(options = {}) {
    const userId = String(options?.userId || '').trim();
    const ownerId = String(options?.ownerId || userId).trim();
    const path = normalizeResoniteInventoryPath(options?.path);

    if (!userId) {
        throw new Error('Missing Resonite user id');
    }

    if (!ownerId) {
        throw new Error('Missing Resonite inventory owner id');
    }

    const advancedSettingsStore = useAdvancedSettingsStore();
    await ensureResoniteSessionIsFresh();

    const apiKey = String(advancedSettingsStore.resoniteApiKey || '').trim();
    if (!apiKey) {
        throw new Error('Missing Resonite API key');
    }

    const response = await webApiService.execute({
        url: `https://api.resonite.com${getResoniteInventoryOwnerPath(ownerId)}/records?path=${encodeURIComponent(path)}`,
        method: 'GET',
        headers: {
            Authorization: buildResoniteAuthorizationHeader(apiKey)
        }
    });

    if (response.status !== 200) {
        throw new Error(
            `Resonite inventory request failed: ${response.status}`
        );
    }

    let payload;
    try {
        payload = JSON.parse(response.data);
    } catch {
        throw new Error('Resonite inventory response was not valid JSON');
    }

    if (!Array.isArray(payload)) {
        throw new Error('Resonite inventory response was not a record array');
    }

    return payload
        .map((record) => normalizeResoniteInventoryRecord(record, { ownerId }))
        .filter(Boolean)
        .sort((left, right) =>
            compareResoniteInventoryRecords(left, right, 'name-asc')
        );
}

export async function resolveResoniteInventoryLink(record) {
    const ownerId = String(record?.linkOwnerId || record?.ownerId || '').trim();
    const recordId = String(record?.linkRecordId || '').trim();

    if (!ownerId || !recordId) {
        throw new Error('Unsupported Resonite inventory link');
    }

    const advancedSettingsStore = useAdvancedSettingsStore();
    await ensureResoniteSessionIsFresh();

    const apiKey = String(advancedSettingsStore.resoniteApiKey || '').trim();
    if (!apiKey) {
        throw new Error('Missing Resonite API key');
    }

    const response = await webApiService.execute({
        url: `https://api.resonite.com${getResoniteInventoryOwnerPath(ownerId)}/records/${encodeURIComponent(recordId)}`,
        method: 'GET',
        headers: {
            Authorization: buildResoniteAuthorizationHeader(apiKey)
        }
    });

    if (response.status !== 200) {
        throw new Error(
            `Resonite inventory link request failed: ${response.status}`
        );
    }

    let payload;
    try {
        payload = JSON.parse(response.data);
    } catch {
        throw new Error('Resonite inventory link response was not valid JSON');
    }

    const normalizedRecord = normalizeResoniteInventoryRecord(payload, {
        ownerId
    });
    if (!normalizedRecord) {
        throw new Error('Resonite inventory link response was invalid');
    }

    return normalizedRecord;
}

export async function fetchResoniteInventoryRecordByPath(options = {}) {
    const ownerId = String(options?.ownerId || options?.userId || '').trim();
    const userId = String(options?.userId || ownerId).trim();
    const normalizedPath = normalizeResoniteInventoryPath(options?.path);

    if (!ownerId) {
        throw new Error('Missing Resonite inventory owner id');
    }

    if (!userId) {
        throw new Error('Missing Resonite user id');
    }

    const segments = normalizedPath
        .split('\\')
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length <= 1) {
        return null;
    }

    const recordName = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('\\');
    const records = await fetchResoniteInventoryRecords({
        userId,
        ownerId,
        path: parentPath
    });

    const normalizedRecordName = recordName.toLowerCase();
    const normalizedAbsolutePath = normalizedPath.toLowerCase();

    return (
        records.find((record) => {
            const candidateName = String(record?.name || '')
                .trim()
                .toLowerCase();
            const candidatePath = String(record?.absolutePath || '')
                .trim()
                .toLowerCase();

            return (
                candidateName === normalizedRecordName ||
                candidatePath === normalizedAbsolutePath
            );
        }) || null
    );
}

export async function fetchResoniteInventoryOwnerDetails(ownerId) {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) {
        return null;
    }

    const cachedEntry = resoniteInventoryOwnerCache.get(normalizedOwnerId);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
        return cachedEntry.value;
    }

    const advancedSettingsStore = useAdvancedSettingsStore();
    await ensureResoniteSessionIsFresh();

    const apiKey = String(advancedSettingsStore.resoniteApiKey || '').trim();
    if (!apiKey) {
        throw new Error('Missing Resonite API key');
    }

    const ownerPath = getResoniteInventoryOwnerPath(normalizedOwnerId);
    const response = await webApiService.execute({
        url: `https://api.resonite.com${ownerPath}`,
        method: 'GET',
        headers: {
            Authorization: buildResoniteAuthorizationHeader(apiKey)
        }
    });

    if (response.status !== 200) {
        throw new Error(
            `Resonite inventory owner request failed: ${response.status}`
        );
    }

    let payload;
    try {
        payload = JSON.parse(response.data);
    } catch {
        throw new Error('Resonite inventory owner response was not valid JSON');
    }

    const value = normalizeResoniteInventoryOwnerDetails(
        payload,
        normalizedOwnerId
    );
    resoniteInventoryOwnerCache.set(normalizedOwnerId, {
        expiresAt: Date.now() + RESONITE_INVENTORY_OWNER_CACHE_TTL_MS,
        value
    });
    return value;
}

export function normalizeResoniteInventoryRecord(record, options = {}) {
    if (!record || typeof record !== 'object') {
        return null;
    }

    const ownerId = firstNonEmptyString(
        record.ownerId,
        record.combinedRecordId?.ownerId,
        options?.ownerId
    );
    const name = firstNonEmptyString(
        record.name,
        record.displayName,
        'Unnamed record'
    );
    const path = String(record.path || '').trim();
    const assetUri = String(record.assetUri || record.url || '').trim();
    const normalizedRecordType = String(
        record.recordType || record.type || 'unknown'
    )
        .trim()
        .toLowerCase();
    const isLink =
        normalizedRecordType === 'link' ||
        assetUri.toLowerCase().startsWith('resrec:///');
    const isDirectory = normalizedRecordType === 'directory';
    const isNavigable = isDirectory || isLink;
    const isItem = !isNavigable;

    return {
        id: firstNonEmptyString(
            record.id,
            record.combinedRecordId?.id,
            `${ownerId}:${path}:${name}`
        ),
        ownerId,
        name,
        path,
        absolutePath: joinResoniteInventoryPath(path, name),
        assetUri,
        recordType: normalizedRecordType || 'unknown',
        recordTypeLabel: getResoniteInventoryRecordTypeLabel({
            isDirectory,
            isLink,
            recordType: normalizedRecordType
        }),
        createdAt: firstNonEmptyString(
            record.creationTime,
            record.creationDate,
            record.createdAt,
            record.lastModificationTime
        ),
        thumbnailUrl: convertFileUrlToImageUrl(
            firstNonEmptyString(record.thumbnailUri, record.thumbnailUrl)
        ),
        isDirectory,
        isLink,
        isNavigable,
        isItem,
        linkOwnerId: extractResoniteLinkOwnerId(assetUri),
        linkRecordId: extractResoniteLinkRecordId(assetUri)
    };
}

export function normalizeResoniteInventoryPath(path) {
    return (
        String(path || '')
            .trim()
            .replace(/[\\/]+/g, '\\') || RESONITE_INVENTORY_ROOT_PATH
    );
}

export function getParentResoniteInventoryPath(path) {
    const normalizedPath = normalizeResoniteInventoryPath(path);
    const segments = normalizedPath
        .split('\\')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length <= 1) {
        return RESONITE_INVENTORY_ROOT_PATH;
    }

    return segments.slice(0, -1).join('\\');
}

export function sortResoniteInventoryRecords(records, sortMode = 'name-asc') {
    return [...(Array.isArray(records) ? records : [])].sort((left, right) =>
        compareResoniteInventoryRecords(left, right, sortMode)
    );
}

export function getResoniteInventoryOwnerPath(ownerId) {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) {
        throw new Error('Missing Resonite inventory owner id');
    }

    const collectionName = /^G-/i.test(normalizedOwnerId) ? 'groups' : 'users';
    return `/${collectionName}/${encodeURIComponent(normalizedOwnerId)}`;
}

function normalizeResoniteInventoryOwnerDetails(payload, ownerId) {
    const normalizedOwnerId = String(ownerId || '').trim();
    const ownerType = /^G-/i.test(normalizedOwnerId) ? 'group' : 'user';
    const displayName = firstNonEmptyString(
        payload?.username,
        payload?.displayName,
        payload?.name,
        payload?.profile?.displayName,
        payload?.profile?.name,
        normalizedOwnerId
    );

    return {
        ownerId: normalizedOwnerId,
        ownerType,
        displayName,
        username: firstNonEmptyString(
            payload?.username,
            payload?.displayName,
            payload?.name
        ),
        raw: payload && typeof payload === 'object' ? payload : {}
    };
}

function compareResoniteInventoryRecords(left, right, sortMode = 'name-asc') {
    if (Boolean(left?.isNavigable) !== Boolean(right?.isNavigable)) {
        return left?.isNavigable ? -1 : 1;
    }

    const leftName = String(left?.name || '').toLowerCase();
    const rightName = String(right?.name || '').toLowerCase();
    const leftCreatedAt = Date.parse(String(left?.createdAt || ''));
    const rightCreatedAt = Date.parse(String(right?.createdAt || ''));

    switch (sortMode) {
        case 'created-desc':
            if (!Number.isNaN(leftCreatedAt) && !Number.isNaN(rightCreatedAt)) {
                if (rightCreatedAt !== leftCreatedAt) {
                    return rightCreatedAt - leftCreatedAt;
                }
            }
            if (leftName !== rightName) {
                return leftName.localeCompare(rightName);
            }
            break;
        case 'created-asc':
            if (!Number.isNaN(leftCreatedAt) && !Number.isNaN(rightCreatedAt)) {
                if (leftCreatedAt !== rightCreatedAt) {
                    return leftCreatedAt - rightCreatedAt;
                }
            }
            if (leftName !== rightName) {
                return leftName.localeCompare(rightName);
            }
            break;
        case 'name-asc':
        default:
            if (leftName !== rightName) {
                return leftName.localeCompare(rightName);
            }
            if (!Number.isNaN(leftCreatedAt) && !Number.isNaN(rightCreatedAt)) {
                if (rightCreatedAt !== leftCreatedAt) {
                    return rightCreatedAt - leftCreatedAt;
                }
            }
            break;
    }

    return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function joinResoniteInventoryPath(path, name) {
    const normalizedPath = String(path || '').trim();
    const normalizedName = String(name || '').trim();

    if (!normalizedPath) {
        return normalizedName;
    }

    if (!normalizedName) {
        return normalizedPath;
    }

    return `${normalizedPath}\\${normalizedName}`;
}

function getResoniteInventoryRecordTypeLabel({
    isDirectory,
    isLink,
    recordType
}) {
    if (isDirectory) {
        return 'Folder';
    }

    if (isLink) {
        return 'Link';
    }

    return String(recordType || 'item')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (value) => value.toUpperCase());
}

function extractResoniteLinkOwnerId(assetUri) {
    const normalizedAssetUri = String(assetUri || '').trim();
    if (!normalizedAssetUri.toLowerCase().startsWith('resrec:///')) {
        return '';
    }

    const remainder = normalizedAssetUri.slice('resrec:///'.length);
    const nextSlashIndex = remainder.indexOf('/');
    return nextSlashIndex === -1
        ? ''
        : remainder.slice(0, nextSlashIndex).trim();
}

function extractResoniteLinkRecordId(assetUri) {
    const normalizedAssetUri = String(assetUri || '').trim();
    if (!normalizedAssetUri.toLowerCase().startsWith('resrec:///')) {
        return '';
    }

    const remainder = normalizedAssetUri.slice('resrec:///'.length);
    const nextSlashIndex = remainder.indexOf('/');
    return nextSlashIndex === -1
        ? ''
        : remainder.slice(nextSlashIndex + 1).trim();
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
