export function pickResoniteStringField({
    preferredValues = [],
    fallbackValues = [],
    trailingValues = []
}) {
    return firstNonEmptyString(
        ...preferredValues,
        ...fallbackValues,
        ...trailingValues
    );
}

export function pickResoniteAuthorityStringField({
    preferPrimary = false,
    primaryValues = [],
    secondaryValues = [],
    trailingValues = []
}) {
    return preferPrimary
        ? firstNonEmptyString(
              ...primaryValues,
              ...secondaryValues,
              ...trailingValues
          )
        : firstNonEmptyString(
              ...secondaryValues,
              ...primaryValues,
              ...trailingValues
          );
}

export function pickResoniteBooleanField({
    preferredValues = [],
    fallbackValues = [],
    defaultValue = false
}) {
    for (const value of [...preferredValues, ...fallbackValues]) {
        if (typeof value === 'boolean') {
            return value;
        }
    }

    return defaultValue;
}

export function pickResoniteStringArrayField({
    preferredValues = [],
    fallbackValues = []
}) {
    return firstStringArray(...preferredValues, ...fallbackValues);
}

export function getResonitePresenceSourcePriority(sourceEvent) {
    switch (String(sourceEvent || '').trim()) {
        case 'ReceiveSessionUpdate':
            return 4;
        case 'ReceiveStatusUpdate':
        case 'InitializeStatus':
            return 3;
        case 'ResolvedSessionName':
            return 2;
        default:
            return 1;
    }
}

export function shouldPreferResoniteSnapshotFields(
    sourceEvent,
    ...snapshotValues
) {
    if (!firstNonEmptyString(...snapshotValues)) {
        return false;
    }

    return getResonitePresenceSourcePriority(sourceEvent) <= 2;
}

export function shouldPreferIncomingResoniteContactFields(
    existingObservedAt,
    incomingObservedAt
) {
    const normalizedExisting = Number(existingObservedAt || 0);
    const normalizedIncoming = Number(incomingObservedAt || 0);

    if (!normalizedIncoming) {
        return true;
    }

    if (!normalizedExisting) {
        return true;
    }

    return normalizedIncoming >= normalizedExisting;
}

export function upsertResoniteMergeTraceField(
    mergeTrace,
    scope,
    field,
    decision
) {
    const normalizedScope = String(scope || '').trim();
    const normalizedField = String(field || '').trim();
    if (!normalizedScope || !normalizedField) {
        return mergeTrace || {};
    }

    const nextTrace = {
        ...(mergeTrace || {})
    };
    const nextScope = {
        ...(nextTrace[normalizedScope] || {})
    };
    const nextDecision = {};

    for (const key of [
        'winner',
        'reason',
        'sourceEvent',
        'existingObservedAt',
        'incomingObservedAt',
        'existingValue',
        'incomingValue',
        'selectedValue'
    ]) {
        if (Object.prototype.hasOwnProperty.call(decision || {}, key)) {
            nextDecision[key] = decision[key];
        }
    }

    nextScope[normalizedField] = nextDecision;
    nextTrace[normalizedScope] = nextScope;
    return nextTrace;
}

function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }

    return '';
}

function firstStringArray(...values) {
    for (const value of values) {
        if (!Array.isArray(value)) {
            continue;
        }

        const normalized = value
            .map((entry) => String(entry || '').trim())
            .filter(Boolean);
        if (normalized.length > 0) {
            return normalized;
        }
    }

    return [];
}
