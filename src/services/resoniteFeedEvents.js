import { formatResoniteWorldLabel } from '../shared/utils/resoniteWorldLabel';

function firstNonEmptyString(...values) {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (normalized) {
            return normalized;
        }
    }

    return '';
}

function firstMeaningfulLocation(...values) {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (
            normalized &&
            normalized !== 'offline' &&
            normalized !== 'traveling'
        ) {
            return normalized;
        }
    }

    return '';
}

function normalizeState(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();

    if (normalized === 'online' || normalized === 'active') {
        return 'online';
    }
    if (normalized === 'offline') {
        return 'offline';
    }

    return normalized || 'offline';
}

function buildResoniteLocationSnapshot(friendLike) {
    const state = normalizeState(friendLike?.state || friendLike?.ref?.state);
    const accessLevel = firstNonEmptyString(
        friendLike?.resonite?.accessLevel,
        friendLike?.resonite?.realtime?.accessLevel,
        friendLike?.ref?.resonite?.accessLevel
    );
    const rawLocation = firstNonEmptyString(
        friendLike?.ref?.traveling,
        friendLike?.ref?.location,
        friendLike?.resonite?.locationName,
        friendLike?.resonite?.currentSessionName,
        friendLike?.ref?.resonite?.locationName,
        friendLike?.ref?.resonite?.currentSessionName
    );

    const normalizedLocation = rawLocation.toLowerCase();
    if (!rawLocation) {
        return {
            label: '',
            location: '',
            worldName: '',
            isPrivate: false,
            isOffline: state === 'offline'
        };
    }

    if (normalizedLocation === 'private') {
        return {
            label: 'Private',
            location: 'private',
            worldName: '',
            isPrivate: true,
            isOffline: false
        };
    }

    if (normalizedLocation === 'offline') {
        return {
            label: '',
            location: 'offline',
            worldName: '',
            isPrivate: false,
            isOffline: true
        };
    }

    if (normalizedLocation === 'traveling') {
        return {
            label: '',
            location: 'traveling',
            worldName: '',
            isPrivate: false,
            isOffline: false
        };
    }

    const formattedLocation = formatResoniteWorldLabel(
        rawLocation,
        accessLevel
    );

    return {
        label: formattedLocation,
        location: formattedLocation,
        worldName: formattedLocation,
        isPrivate: false,
        isOffline: false
    };
}

function buildBaseRefPatch(previousFriend, now) {
    const previousRef = previousFriend?.ref || {};

    return {
        $location_at: Number(previousRef.$location_at || now),
        $online_for: previousRef.$online_for || '',
        $travelingToTime: Number(previousRef.$travelingToTime || now),
        $offline_for: previousRef.$offline_for || '',
        $active_for: previousRef.$active_for || '',
        $previousLocation: previousRef.$previousLocation || ''
    };
}

function buildFeedBase(nextFriend, nowIso) {
    return {
        created_at: nowIso(),
        userId: String(nextFriend?.id || '').trim(),
        displayName: firstNonEmptyString(
            nextFriend?.name,
            nextFriend?.ref?.displayName
        ),
        provider: 'resonite'
    };
}

export function buildResonitePresenceFeedUpdate(
    previousFriend,
    nextFriend,
    { now = Date.now, nowIso = () => new Date().toJSON() } = {}
) {
    const ts = now();
    const refPatch = buildBaseRefPatch(previousFriend, ts);
    const feedEntries = [];

    if (!nextFriend?.id || !nextFriend?.ref) {
        return { refPatch, feedEntries };
    }

    const previousState = normalizeState(previousFriend?.state);
    const nextState = normalizeState(nextFriend?.state);
    const previousLocation = buildResoniteLocationSnapshot(previousFriend);
    const nextLocation = buildResoniteLocationSnapshot(nextFriend);
    const previousVisibleLocation = firstMeaningfulLocation(
        previousLocation.location,
        refPatch.$previousLocation
    );
    const previousLocationAt = Number(refPatch.$location_at || ts);
    const feedBase = buildFeedBase(nextFriend, nowIso);

    if (!previousFriend) {
        if (nextState === 'online') {
            refPatch.$location_at = ts;
            refPatch.$online_for = ts;
            refPatch.$offline_for = '';
            refPatch.$active_for = '';
            refPatch.$travelingToTime = ts;
            refPatch.$previousLocation = '';
        } else {
            refPatch.$offline_for = ts;
            refPatch.$online_for = '';
        }

        return { refPatch, feedEntries };
    }

    if (previousState !== nextState) {
        if (previousState === 'online' && nextState === 'offline') {
            refPatch.$online_for = '';
            refPatch.$offline_for = ts;
            refPatch.$active_for = '';
            feedEntries.push({
                ...feedBase,
                type: 'Offline',
                location: previousVisibleLocation || nextLocation.location,
                worldName:
                    previousLocation.worldName ||
                    previousVisibleLocation ||
                    nextLocation.worldName ||
                    '',
                groupName: '',
                time: Math.max(0, ts - previousLocationAt)
            });
        } else if (nextState === 'online') {
            refPatch.$previousLocation = '';
            refPatch.$travelingToTime = ts;
            refPatch.$location_at = ts;
            refPatch.$online_for = ts;
            refPatch.$offline_for = '';
            refPatch.$active_for = '';
            feedEntries.push({
                ...feedBase,
                type: 'Online',
                location: nextLocation.location,
                worldName: nextLocation.worldName,
                groupName: '',
                time: ''
            });
        }
    } else if (
        nextState === 'online' &&
        nextLocation.location &&
        previousVisibleLocation &&
        previousVisibleLocation !== nextLocation.location &&
        previousVisibleLocation !== 'offline' &&
        nextLocation.location !== 'offline' &&
        previousVisibleLocation !== 'traveling' &&
        nextLocation.location !== 'traveling'
    ) {
        refPatch.$location_at = ts;
        refPatch.$previousLocation = '';
        refPatch.$travelingToTime = ts;
        feedEntries.push({
            ...feedBase,
            type: 'GPS',
            location: nextLocation.location,
            worldName: nextLocation.worldName,
            groupName: '',
            previousLocation: previousVisibleLocation,
            time: Math.max(0, ts - previousLocationAt)
        });
    } else if (
        nextState === 'online' &&
        previousLocation.location &&
        previousLocation.location !== 'offline' &&
        previousLocation.location !== 'traveling' &&
        !nextLocation.location
    ) {
        refPatch.$previousLocation = previousLocation.location;
    } else if (
        nextState === 'online' &&
        nextLocation.location &&
        refPatch.$previousLocation === nextLocation.location
    ) {
        refPatch.$previousLocation = '';
    }

    const previousStatus = String(previousFriend?.ref?.status || '').trim();
    const nextStatus = String(nextFriend?.ref?.status || '').trim();
    const previousStatusDescription = String(
        previousFriend?.ref?.statusDescription || ''
    ).trim();
    const nextStatusDescription = String(
        nextFriend?.ref?.statusDescription || ''
    ).trim();

    const statusChanged =
        previousStatus !== nextStatus ||
        previousStatusDescription !== nextStatusDescription;

    if (
        nextState === 'online' &&
        statusChanged &&
        (nextStatus || nextStatusDescription)
    ) {
        feedEntries.push({
            ...feedBase,
            type: 'Status',
            status: nextStatus,
            statusDescription: nextStatusDescription,
            previousStatus,
            previousStatusDescription
        });
    }

    return { refPatch, feedEntries };
}
