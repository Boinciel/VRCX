export function getResoniteAccessLevelLabel(accessLevel) {
    const normalized = String(accessLevel || '')
        .trim()
        .toLowerCase();

    const labels = {
        private: 'Private',
        lan: 'LAN',
        contacts: 'Contacts only',
        'contacts only': 'Contacts only',
        contactsplus: 'Contacts+',
        'contacts+': 'Contacts+',
        registeredusers: 'Registered',
        'registered users': 'Registered',
        anyone: 'Public',
        public: 'Public'
    };

    return labels[normalized] || normalized;
}

export function formatResoniteWorldLabel(worldName, accessLevel) {
    const baseWorldName = String(worldName || '').trim();
    const accessSuffix = getResoniteAccessLevelLabel(accessLevel);

    if (!baseWorldName) {
        return accessSuffix;
    }

    if (
        !accessSuffix ||
        baseWorldName.toLowerCase() === accessSuffix.toLowerCase()
    ) {
        return baseWorldName;
    }

    const normalizedBaseWorldName = baseWorldName.toLowerCase();
    const normalizedAccessSuffix = accessSuffix.toLowerCase();
    if (normalizedBaseWorldName.endsWith(` - ${normalizedAccessSuffix}`)) {
        return baseWorldName;
    }

    return `${baseWorldName} - ${accessSuffix}`;
}
