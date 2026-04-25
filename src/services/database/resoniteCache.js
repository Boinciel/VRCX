import { dbVars } from '../database';

import sqliteService from '../sqlite.js';

function contactsTable() {
    return `${dbVars.userPrefix}_resonite_contacts_cache_v1`;
}

function profilesTable() {
    return `${dbVars.userPrefix}_resonite_profiles_cache_v1`;
}

function presenceTable() {
    return `${dbVars.userPrefix}_resonite_presence_cache_v1`;
}

function sessionsTable() {
    return `${dbVars.userPrefix}_resonite_session_cache_v1`;
}

function syncStateTable() {
    return `${dbVars.userPrefix}_resonite_sync_state_v1`;
}

function parseJson(value, fallback) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function stringifyJson(value, fallback = '{}') {
    try {
        return JSON.stringify(value ?? JSON.parse(fallback));
    } catch {
        return fallback;
    }
}

function normalizeDistinctStrings(values) {
    return [
        ...new Set(
            (Array.isArray(values) ? values : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )
    ];
}

function buildQuotedList(values) {
    return normalizeDistinctStrings(values)
        .map((value) => `'${value.replaceAll("'", "''")}'`)
        .join(', ');
}

const resoniteCache = {
    async initResoniteCacheTables() {
        await sqliteService.executeNonQuery(
            `CREATE TABLE IF NOT EXISTS ${contactsTable()} (
                external_id TEXT PRIMARY KEY,
                resonite_user_id TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                username TEXT NOT NULL DEFAULT '',
                normalized_username TEXT NOT NULL DEFAULT '',
                contact_status TEXT NOT NULL DEFAULT '',
                is_accepted INTEGER,
                latest_message_time TEXT NOT NULL DEFAULT '',
                is_system_contact INTEGER NOT NULL DEFAULT 0,
                fetched_at INTEGER NOT NULL DEFAULT 0,
                last_successful_snapshot_at INTEGER NOT NULL DEFAULT 0,
                source_revision TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}'
            )`
        );
        await sqliteService.executeNonQuery(
            `CREATE INDEX IF NOT EXISTS ${dbVars.userPrefix}_resonite_contacts_user_idx ON ${contactsTable()} (resonite_user_id)`
        );
        await sqliteService.executeNonQuery(
            `CREATE INDEX IF NOT EXISTS ${dbVars.userPrefix}_resonite_contacts_snapshot_idx ON ${contactsTable()} (last_successful_snapshot_at)`
        );

        await sqliteService.executeNonQuery(
            `CREATE TABLE IF NOT EXISTS ${profilesTable()} (
                resonite_user_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL DEFAULT '',
                username TEXT NOT NULL DEFAULT '',
                registration_date TEXT NOT NULL DEFAULT '',
                is_verified INTEGER,
                tags_json TEXT NOT NULL DEFAULT '[]',
                icon_url TEXT NOT NULL DEFAULT '',
                tagline TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                fetched_at INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL DEFAULT '{}'
            )`
        );
        await sqliteService.executeNonQuery(
            `CREATE INDEX IF NOT EXISTS ${dbVars.userPrefix}_resonite_profiles_expiry_idx ON ${profilesTable()} (expires_at)`
        );

        await sqliteService.executeNonQuery(
            `CREATE TABLE IF NOT EXISTS ${presenceTable()} (
                resonite_user_id TEXT PRIMARY KEY,
                online_status TEXT NOT NULL DEFAULT '',
                location_name TEXT NOT NULL DEFAULT '',
                current_session_hash TEXT NOT NULL DEFAULT '',
                current_session_name TEXT NOT NULL DEFAULT '',
                user_session_id TEXT NOT NULL DEFAULT '',
                session_type TEXT NOT NULL DEFAULT '',
                output_device TEXT NOT NULL DEFAULT '',
                app_version TEXT NOT NULL DEFAULT '',
                compatibility_hash TEXT NOT NULL DEFAULT '',
                is_mobile INTEGER,
                is_present INTEGER,
                observed_at INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}'
            )`
        );
        await sqliteService.executeNonQuery(
            `CREATE INDEX IF NOT EXISTS ${dbVars.userPrefix}_resonite_presence_expiry_idx ON ${presenceTable()} (expires_at)`
        );
        await sqliteService.executeNonQuery(
            `CREATE INDEX IF NOT EXISTS ${dbVars.userPrefix}_resonite_presence_session_idx ON ${presenceTable()} (current_session_hash)`
        );

        await sqliteService.executeNonQuery(
            `CREATE TABLE IF NOT EXISTS ${sessionsTable()} (
                session_hash TEXT PRIMARY KEY,
                session_name TEXT NOT NULL DEFAULT '',
                host_user_id TEXT NOT NULL DEFAULT '',
                observed_at INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL DEFAULT '{}'
            )`
        );
        await sqliteService.executeNonQuery(
            `CREATE INDEX IF NOT EXISTS ${dbVars.userPrefix}_resonite_sessions_expiry_idx ON ${sessionsTable()} (expires_at)`
        );

        await sqliteService.executeNonQuery(
            `CREATE TABLE IF NOT EXISTS ${syncStateTable()} (
                scope TEXT PRIMARY KEY,
                last_attempt_at INTEGER NOT NULL DEFAULT 0,
                last_successful_snapshot_at INTEGER NOT NULL DEFAULT 0,
                last_successful_presence_at INTEGER NOT NULL DEFAULT 0,
                last_error_text TEXT NOT NULL DEFAULT '',
                snapshot_revision TEXT NOT NULL DEFAULT '',
                active_resonite_user_id TEXT NOT NULL DEFAULT '',
                snapshot_failure_count INTEGER NOT NULL DEFAULT 0,
                next_snapshot_retry_at INTEGER NOT NULL DEFAULT 0,
                presence_failure_count INTEGER NOT NULL DEFAULT 0,
                next_presence_retry_at INTEGER NOT NULL DEFAULT 0
            )`
        );
    },

    async getResoniteCachedContacts() {
        const rows = [];
        await sqliteService.execute((dbRow) => {
            rows.push({
                externalId: dbRow[0],
                resoniteUserId: dbRow[1],
                displayName: dbRow[2],
                username: dbRow[3],
                normalizedUsername: dbRow[4],
                contactStatus: dbRow[5],
                isAccepted: dbRow[6],
                latestMessageTime: dbRow[7],
                isSystemContact: Boolean(dbRow[8]),
                fetchedAt: Number(dbRow[9] || 0),
                lastSuccessfulSnapshotAt: Number(dbRow[10] || 0),
                sourceRevision: dbRow[11],
                payload: parseJson(dbRow[12], {})
            });
        }, `SELECT external_id, resonite_user_id, display_name, username, normalized_username, contact_status, is_accepted, latest_message_time, is_system_contact, fetched_at, last_successful_snapshot_at, source_revision, payload_json FROM ${contactsTable()} ORDER BY display_name COLLATE NOCASE ASC, external_id ASC`);
        return rows;
    },

    upsertResoniteCachedContact(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR REPLACE INTO ${contactsTable()} (external_id, resonite_user_id, display_name, username, normalized_username, contact_status, is_accepted, latest_message_time, is_system_contact, fetched_at, last_successful_snapshot_at, source_revision, payload_json) VALUES (@external_id, @resonite_user_id, @display_name, @username, @normalized_username, @contact_status, @is_accepted, @latest_message_time, @is_system_contact, @fetched_at, @last_successful_snapshot_at, @source_revision, @payload_json)`,
            {
                '@external_id': String(entry?.externalId || '').trim(),
                '@resonite_user_id': String(entry?.resoniteUserId || '').trim(),
                '@display_name': String(entry?.displayName || '').trim(),
                '@username': String(entry?.username || '').trim(),
                '@normalized_username': String(
                    entry?.normalizedUsername || ''
                ).trim(),
                '@contact_status': String(entry?.contactStatus || '').trim(),
                '@is_accepted':
                    entry?.isAccepted === undefined
                        ? null
                        : entry.isAccepted
                          ? 1
                          : 0,
                '@latest_message_time': String(
                    entry?.latestMessageTime || ''
                ).trim(),
                '@is_system_contact': entry?.isSystemContact ? 1 : 0,
                '@fetched_at': Number(entry?.fetchedAt || 0),
                '@last_successful_snapshot_at': Number(
                    entry?.lastSuccessfulSnapshotAt || 0
                ),
                '@source_revision': String(entry?.sourceRevision || '').trim(),
                '@payload_json': stringifyJson(entry?.payload, '{}')
            }
        );
    },

    async replaceResoniteCachedContacts(entries) {
        await sqliteService.executeNonQuery(`DELETE FROM ${contactsTable()}`);
        for (const entry of Array.isArray(entries) ? entries : []) {
            this.upsertResoniteCachedContact(entry);
        }
    },

    async getResoniteCachedProfiles(userIds = []) {
        const rows = [];
        const whereClause = buildQuotedList(userIds);
        await sqliteService.execute(
            (dbRow) => {
                rows.push({
                    resoniteUserId: dbRow[0],
                    displayName: dbRow[1],
                    username: dbRow[2],
                    registrationDate: dbRow[3],
                    isVerified: dbRow[4],
                    tags: parseJson(dbRow[5], []),
                    iconUrl: dbRow[6],
                    tagline: dbRow[7],
                    description: dbRow[8],
                    fetchedAt: Number(dbRow[9] || 0),
                    expiresAt: Number(dbRow[10] || 0),
                    payload: parseJson(dbRow[11], {})
                });
            },
            `SELECT resonite_user_id, display_name, username, registration_date, is_verified, tags_json, icon_url, tagline, description, fetched_at, expires_at, payload_json FROM ${profilesTable()} ${whereClause ? `WHERE resonite_user_id IN (${whereClause})` : ''} ORDER BY resonite_user_id ASC`
        );
        return rows;
    },

    upsertResoniteCachedProfile(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR REPLACE INTO ${profilesTable()} (resonite_user_id, display_name, username, registration_date, is_verified, tags_json, icon_url, tagline, description, fetched_at, expires_at, payload_json) VALUES (@resonite_user_id, @display_name, @username, @registration_date, @is_verified, @tags_json, @icon_url, @tagline, @description, @fetched_at, @expires_at, @payload_json)`,
            {
                '@resonite_user_id': String(entry?.resoniteUserId || '').trim(),
                '@display_name': String(entry?.displayName || '').trim(),
                '@username': String(entry?.username || '').trim(),
                '@registration_date': String(
                    entry?.registrationDate || ''
                ).trim(),
                '@is_verified':
                    entry?.isVerified === undefined
                        ? null
                        : entry.isVerified
                          ? 1
                          : 0,
                '@tags_json': stringifyJson(entry?.tags, '[]'),
                '@icon_url': String(entry?.iconUrl || '').trim(),
                '@tagline': String(entry?.tagline || '').trim(),
                '@description': String(entry?.description || '').trim(),
                '@fetched_at': Number(entry?.fetchedAt || 0),
                '@expires_at': Number(entry?.expiresAt || 0),
                '@payload_json': stringifyJson(entry?.payload, '{}')
            }
        );
    },

    async getResoniteCachedPresence(userIds = []) {
        const rows = [];
        const whereClause = buildQuotedList(userIds);
        await sqliteService.execute(
            (dbRow) => {
                rows.push({
                    resoniteUserId: dbRow[0],
                    onlineStatus: dbRow[1],
                    locationName: dbRow[2],
                    currentSessionHash: dbRow[3],
                    currentSessionName: dbRow[4],
                    userSessionId: dbRow[5],
                    sessionType: dbRow[6],
                    outputDevice: dbRow[7],
                    appVersion: dbRow[8],
                    compatibilityHash: dbRow[9],
                    isMobile: dbRow[10],
                    isPresent: dbRow[11],
                    observedAt: Number(dbRow[12] || 0),
                    expiresAt: Number(dbRow[13] || 0),
                    source: dbRow[14],
                    payload: parseJson(dbRow[15], {})
                });
            },
            `SELECT resonite_user_id, online_status, location_name, current_session_hash, current_session_name, user_session_id, session_type, output_device, app_version, compatibility_hash, is_mobile, is_present, observed_at, expires_at, source, payload_json FROM ${presenceTable()} ${whereClause ? `WHERE resonite_user_id IN (${whereClause})` : ''} ORDER BY resonite_user_id ASC`
        );
        return rows;
    },

    upsertResoniteCachedPresence(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR REPLACE INTO ${presenceTable()} (resonite_user_id, online_status, location_name, current_session_hash, current_session_name, user_session_id, session_type, output_device, app_version, compatibility_hash, is_mobile, is_present, observed_at, expires_at, source, payload_json) VALUES (@resonite_user_id, @online_status, @location_name, @current_session_hash, @current_session_name, @user_session_id, @session_type, @output_device, @app_version, @compatibility_hash, @is_mobile, @is_present, @observed_at, @expires_at, @source, @payload_json)`,
            {
                '@resonite_user_id': String(entry?.resoniteUserId || '').trim(),
                '@online_status': String(entry?.onlineStatus || '').trim(),
                '@location_name': String(entry?.locationName || '').trim(),
                '@current_session_hash': String(
                    entry?.currentSessionHash || ''
                ).trim(),
                '@current_session_name': String(
                    entry?.currentSessionName || ''
                ).trim(),
                '@user_session_id': String(entry?.userSessionId || '').trim(),
                '@session_type': String(entry?.sessionType || '').trim(),
                '@output_device': String(entry?.outputDevice || '').trim(),
                '@app_version': String(entry?.appVersion || '').trim(),
                '@compatibility_hash': String(
                    entry?.compatibilityHash || ''
                ).trim(),
                '@is_mobile':
                    entry?.isMobile === undefined
                        ? null
                        : entry.isMobile
                          ? 1
                          : 0,
                '@is_present':
                    entry?.isPresent === undefined
                        ? null
                        : entry.isPresent
                          ? 1
                          : 0,
                '@observed_at': Number(entry?.observedAt || 0),
                '@expires_at': Number(entry?.expiresAt || 0),
                '@source': String(entry?.source || '').trim(),
                '@payload_json': stringifyJson(entry?.payload, '{}')
            }
        );
    },

    async replaceResoniteCachedPresence(entries) {
        await sqliteService.executeNonQuery(`DELETE FROM ${presenceTable()}`);
        for (const entry of Array.isArray(entries) ? entries : []) {
            this.upsertResoniteCachedPresence(entry);
        }
    },

    async clearResoniteCachedPresence() {
        await sqliteService.executeNonQuery(`DELETE FROM ${presenceTable()}`);
    },

    async getResoniteCachedSessions(sessionHashes = []) {
        const rows = [];
        const whereClause = buildQuotedList(sessionHashes);
        await sqliteService.execute(
            (dbRow) => {
                rows.push({
                    sessionHash: dbRow[0],
                    sessionName: dbRow[1],
                    hostUserId: dbRow[2],
                    observedAt: Number(dbRow[3] || 0),
                    expiresAt: Number(dbRow[4] || 0),
                    payload: parseJson(dbRow[5], {})
                });
            },
            `SELECT session_hash, session_name, host_user_id, observed_at, expires_at, payload_json FROM ${sessionsTable()} ${whereClause ? `WHERE session_hash IN (${whereClause})` : ''} ORDER BY observed_at DESC, session_hash ASC`
        );
        return rows;
    },

    upsertResoniteCachedSession(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR REPLACE INTO ${sessionsTable()} (session_hash, session_name, host_user_id, observed_at, expires_at, payload_json) VALUES (@session_hash, @session_name, @host_user_id, @observed_at, @expires_at, @payload_json)`,
            {
                '@session_hash': String(entry?.sessionHash || '').trim(),
                '@session_name': String(entry?.sessionName || '').trim(),
                '@host_user_id': String(entry?.hostUserId || '').trim(),
                '@observed_at': Number(entry?.observedAt || 0),
                '@expires_at': Number(entry?.expiresAt || 0),
                '@payload_json': stringifyJson(entry?.payload, '{}')
            }
        );
    },

    async replaceResoniteCachedSessions(entries) {
        await sqliteService.executeNonQuery(`DELETE FROM ${sessionsTable()}`);
        for (const entry of Array.isArray(entries) ? entries : []) {
            this.upsertResoniteCachedSession(entry);
        }
    },

    async clearResoniteCachedSessions() {
        await sqliteService.executeNonQuery(`DELETE FROM ${sessionsTable()}`);
    },

    async getResoniteSyncState(scope = 'default') {
        const normalizedScope = String(scope || 'default').trim() || 'default';
        let row = null;
        await sqliteService.execute(
            (dbRow) => {
                row = {
                    scope: dbRow[0],
                    lastAttemptAt: Number(dbRow[1] || 0),
                    lastSuccessfulSnapshotAt: Number(dbRow[2] || 0),
                    lastSuccessfulPresenceAt: Number(dbRow[3] || 0),
                    lastErrorText: dbRow[4],
                    snapshotRevision: dbRow[5],
                    activeResoniteUserId: dbRow[6],
                    snapshotFailureCount: Number(dbRow[7] || 0),
                    nextSnapshotRetryAt: Number(dbRow[8] || 0),
                    presenceFailureCount: Number(dbRow[9] || 0),
                    nextPresenceRetryAt: Number(dbRow[10] || 0)
                };
            },
            `SELECT scope, last_attempt_at, last_successful_snapshot_at, last_successful_presence_at, last_error_text, snapshot_revision, active_resonite_user_id, snapshot_failure_count, next_snapshot_retry_at, presence_failure_count, next_presence_retry_at FROM ${syncStateTable()} WHERE scope = @scope`,
            {
                '@scope': normalizedScope
            }
        );
        return row;
    },

    async setResoniteSyncState(entry) {
        const normalizedScope =
            String(entry?.scope || 'default').trim() || 'default';
        const existingEntry =
            (await this.getResoniteSyncState(normalizedScope)) || {};

        await sqliteService.executeNonQuery(
            `INSERT OR REPLACE INTO ${syncStateTable()} (scope, last_attempt_at, last_successful_snapshot_at, last_successful_presence_at, last_error_text, snapshot_revision, active_resonite_user_id, snapshot_failure_count, next_snapshot_retry_at, presence_failure_count, next_presence_retry_at) VALUES (@scope, @last_attempt_at, @last_successful_snapshot_at, @last_successful_presence_at, @last_error_text, @snapshot_revision, @active_resonite_user_id, @snapshot_failure_count, @next_snapshot_retry_at, @presence_failure_count, @next_presence_retry_at)`,
            {
                '@scope': normalizedScope,
                '@last_attempt_at': Number(
                    entry?.lastAttemptAt === undefined
                        ? existingEntry.lastAttemptAt || 0
                        : entry.lastAttemptAt || 0
                ),
                '@last_successful_snapshot_at': Number(
                    entry?.lastSuccessfulSnapshotAt === undefined
                        ? existingEntry.lastSuccessfulSnapshotAt || 0
                        : entry.lastSuccessfulSnapshotAt || 0
                ),
                '@last_successful_presence_at': Number(
                    entry?.lastSuccessfulPresenceAt === undefined
                        ? existingEntry.lastSuccessfulPresenceAt || 0
                        : entry.lastSuccessfulPresenceAt || 0
                ),
                '@last_error_text': String(
                    entry?.lastErrorText === undefined
                        ? existingEntry.lastErrorText || ''
                        : entry.lastErrorText || ''
                ).trim(),
                '@snapshot_revision': String(
                    entry?.snapshotRevision === undefined
                        ? existingEntry.snapshotRevision || ''
                        : entry.snapshotRevision || ''
                ).trim(),
                '@active_resonite_user_id': String(
                    entry?.activeResoniteUserId === undefined
                        ? existingEntry.activeResoniteUserId || ''
                        : entry.activeResoniteUserId || ''
                ).trim(),
                '@snapshot_failure_count': Number(
                    entry?.snapshotFailureCount === undefined
                        ? existingEntry.snapshotFailureCount || 0
                        : entry.snapshotFailureCount || 0
                ),
                '@next_snapshot_retry_at': Number(
                    entry?.nextSnapshotRetryAt === undefined
                        ? existingEntry.nextSnapshotRetryAt || 0
                        : entry.nextSnapshotRetryAt || 0
                ),
                '@presence_failure_count': Number(
                    entry?.presenceFailureCount === undefined
                        ? existingEntry.presenceFailureCount || 0
                        : entry.presenceFailureCount || 0
                ),
                '@next_presence_retry_at': Number(
                    entry?.nextPresenceRetryAt === undefined
                        ? existingEntry.nextPresenceRetryAt || 0
                        : entry.nextPresenceRetryAt || 0
                )
            }
        );
    },

    async pruneExpiredResoniteCache(now = Date.now()) {
        const cutoff = Number(now || 0);
        await sqliteService.executeNonQuery(
            `DELETE FROM ${profilesTable()} WHERE expires_at > 0 AND expires_at <= @cutoff`,
            {
                '@cutoff': cutoff
            }
        );
        await sqliteService.executeNonQuery(
            `DELETE FROM ${presenceTable()} WHERE expires_at > 0 AND expires_at <= @cutoff`,
            {
                '@cutoff': cutoff
            }
        );
        await sqliteService.executeNonQuery(
            `DELETE FROM ${sessionsTable()} WHERE expires_at > 0 AND expires_at <= @cutoff`,
            {
                '@cutoff': cutoff
            }
        );
    },

    async clearResoniteCache() {
        await sqliteService.executeNonQuery(`DELETE FROM ${contactsTable()}`);
        await sqliteService.executeNonQuery(`DELETE FROM ${profilesTable()}`);
        await sqliteService.executeNonQuery(`DELETE FROM ${presenceTable()}`);
        await sqliteService.executeNonQuery(`DELETE FROM ${sessionsTable()}`);
        await sqliteService.executeNonQuery(`DELETE FROM ${syncStateTable()}`);
    }
};

export { resoniteCache };
