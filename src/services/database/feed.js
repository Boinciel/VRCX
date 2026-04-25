import { dbVars } from '../database';

import sqliteService from '../sqlite.js';

function buildProviderFilter(provider) {
    const normalizedProvider = String(provider || '')
        .trim()
        .toLowerCase();

    if (!normalizedProvider) {
        return {
            providerQuery: '',
            providerArgs: {}
        };
    }

    if (normalizedProvider === 'resonite') {
        return {
            providerQuery:
                "AND (provider = @provider OR (provider = '' AND (user_id LIKE 'resonite:%' OR user_id LIKE 'U-%' OR user_id LIKE 'u-%')))",
            providerArgs: {
                '@provider': normalizedProvider
            }
        };
    }

    if (normalizedProvider === 'vrchat') {
        return {
            providerQuery:
                "AND (provider = @provider OR (provider = '' AND user_id NOT LIKE 'resonite:%' AND user_id NOT LIKE 'U-%' AND user_id NOT LIKE 'u-%'))",
            providerArgs: {
                '@provider': normalizedProvider
            }
        };
    }

    return {
        providerQuery: 'AND provider = @provider',
        providerArgs: {
            '@provider': normalizedProvider
        }
    };
}

const feed = {
    addGPSToDatabase(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR IGNORE INTO ${dbVars.userPrefix}_feed_gps (created_at, user_id, display_name, provider, location, world_name, previous_location, time, group_name) VALUES (@created_at, @user_id, @display_name, @provider, @location, @world_name, @previous_location, @time, @group_name)`,
            {
                '@created_at': entry.created_at,
                '@user_id': entry.userId,
                '@display_name': entry.displayName,
                '@provider': entry.provider || '',
                '@location': entry.location,
                '@world_name': entry.worldName,
                '@previous_location': entry.previousLocation,
                '@time': entry.time,
                '@group_name': entry.groupName
            }
        );
    },

    addStatusToDatabase(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR IGNORE INTO ${dbVars.userPrefix}_feed_status (created_at, user_id, display_name, provider, status, status_description, previous_status, previous_status_description) VALUES (@created_at, @user_id, @display_name, @provider, @status, @status_description, @previous_status, @previous_status_description)`,
            {
                '@created_at': entry.created_at,
                '@user_id': entry.userId,
                '@display_name': entry.displayName,
                '@provider': entry.provider || '',
                '@status': entry.status,
                '@status_description': entry.statusDescription,
                '@previous_status': entry.previousStatus,
                '@previous_status_description': entry.previousStatusDescription
            }
        );
    },

    addBioToDatabase(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR IGNORE INTO ${dbVars.userPrefix}_feed_bio (created_at, user_id, display_name, provider, bio, previous_bio) VALUES (@created_at, @user_id, @display_name, @provider, @bio, @previous_bio)`,
            {
                '@created_at': entry.created_at,
                '@user_id': entry.userId,
                '@display_name': entry.displayName,
                '@provider': entry.provider || '',
                '@bio': entry.bio,
                '@previous_bio': entry.previousBio
            }
        );
    },

    addAvatarToDatabase(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR IGNORE INTO ${dbVars.userPrefix}_feed_avatar (created_at, user_id, display_name, provider, owner_id, avatar_name, current_avatar_image_url, current_avatar_thumbnail_image_url, previous_current_avatar_image_url, previous_current_avatar_thumbnail_image_url) VALUES (@created_at, @user_id, @display_name, @provider, @owner_id, @avatar_name, @current_avatar_image_url, @current_avatar_thumbnail_image_url, @previous_current_avatar_image_url, @previous_current_avatar_thumbnail_image_url)`,
            {
                '@created_at': entry.created_at,
                '@user_id': entry.userId,
                '@display_name': entry.displayName,
                '@provider': entry.provider || '',
                '@owner_id': entry.ownerId,
                '@avatar_name': entry.avatarName,
                '@current_avatar_image_url': entry.currentAvatarImageUrl,
                '@current_avatar_thumbnail_image_url':
                    entry.currentAvatarThumbnailImageUrl,
                '@previous_current_avatar_image_url':
                    entry.previousCurrentAvatarImageUrl,
                '@previous_current_avatar_thumbnail_image_url':
                    entry.previousCurrentAvatarThumbnailImageUrl
            }
        );
    },

    /**
     * Purges avatar feed data from the database.
     * !!!!
     * @param {string|null} cutoffDate - ISO date string. Deletes records older than this date. If null, deletes all records.
     */
    async purgeAvatarFeedData(cutoffDate) {
        if (cutoffDate) {
            await sqliteService.executeNonQuery(
                `DELETE FROM ${dbVars.userPrefix}_feed_avatar WHERE created_at < @cutoff`,
                {
                    '@cutoff': cutoffDate
                }
            );
        } else {
            await sqliteService.executeNonQuery(
                `DELETE FROM ${dbVars.userPrefix}_feed_avatar`
            );
        }
    },

    addOnlineOfflineToDatabase(entry) {
        sqliteService.executeNonQuery(
            `INSERT OR IGNORE INTO ${dbVars.userPrefix}_feed_online_offline (created_at, user_id, display_name, provider, type, location, world_name, time, group_name) VALUES (@created_at, @user_id, @display_name, @provider, @type, @location, @world_name, @time, @group_name)`,
            {
                '@created_at': entry.created_at,
                '@user_id': entry.userId,
                '@display_name': entry.displayName,
                '@provider': entry.provider || '',
                '@type': entry.type,
                '@location': entry.location,
                '@world_name': entry.worldName,
                '@time': entry.time,
                '@group_name': entry.groupName
            }
        );
    },

    async searchFeedDatabase(
        search,
        filters,
        vipList,
        maxEntries = dbVars.searchTableSize,
        dateFrom = '',
        dateTo = '',
        provider = ''
    ) {
        if (search.startsWith('wrld_') || search.startsWith('grp_')) {
            return this.getFeedByInstanceId(search, filters, vipList, provider);
        }
        let vipQuery = '';
        const vipArgs = {};
        if (vipList.length > 0) {
            const vipPlaceholders = [];
            vipList.forEach((vip, i) => {
                const key = `@vip_${i}`;
                vipArgs[key] = vip;
                vipPlaceholders.push(key);
            });
            vipQuery = `AND user_id IN (${vipPlaceholders.join(', ')})`;
        }
        let dateQuery = '';
        if (dateFrom) {
            dateQuery += 'AND created_at >= @dateFrom ';
        }
        if (dateTo) {
            dateQuery += 'AND created_at <= @dateTo ';
        }
        const { providerQuery, providerArgs } = buildProviderFilter(provider);
        let gps = true;
        let status = true;
        let bio = true;
        let avatar = true;
        let online = true;
        let offline = true;
        const aviPublic = search.includes('public');
        const aviPrivate = search.includes('private');
        if (filters.length > 0) {
            gps = false;
            status = false;
            bio = false;
            avatar = false;
            online = false;
            offline = false;
            filters.forEach((filter) => {
                switch (filter) {
                    case 'GPS':
                        gps = true;
                        break;
                    case 'Status':
                        status = true;
                        break;
                    case 'Bio':
                        bio = true;
                        break;
                    case 'Avatar':
                        avatar = true;
                        break;
                    case 'Online':
                        online = true;
                        break;
                    case 'Offline':
                        offline = true;
                        break;
                }
            });
        }
        const searchLike = `%${search}%`;
        const selects = [];
        const baseColumns = [
            'id',
            'created_at',
            'user_id',
            'display_name',
            'provider',
            'type',
            'location',
            'world_name',
            'previous_location',
            'time',
            'group_name',
            'status',
            'status_description',
            'previous_status',
            'previous_status_description',
            'bio',
            'previous_bio',
            'owner_id',
            'avatar_name',
            'current_avatar_image_url',
            'current_avatar_thumbnail_image_url',
            'previous_current_avatar_image_url',
            'previous_current_avatar_thumbnail_image_url'
        ].join(', ');
        if (gps) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'GPS' AS type, location, world_name, previous_location, time, group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_gps WHERE (display_name LIKE @searchLike OR world_name LIKE @searchLike OR group_name LIKE @searchLike) ${providerQuery} ${dateQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (status) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'Status' AS type, NULL AS location, NULL AS world_name, NULL AS previous_location, NULL AS time, NULL AS group_name, status, status_description, previous_status, previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_status WHERE (display_name LIKE @searchLike OR status LIKE @searchLike OR status_description LIKE @searchLike) ${providerQuery} ${dateQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (bio) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'Bio' AS type, NULL AS location, NULL AS world_name, NULL AS previous_location, NULL AS time, NULL AS group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, bio, previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_bio WHERE (display_name LIKE @searchLike OR bio LIKE @searchLike) ${providerQuery} ${dateQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (avatar) {
            let avatarQuery = '';
            if (aviPrivate) {
                avatarQuery = 'OR user_id = owner_id';
            } else if (aviPublic) {
                avatarQuery = 'OR user_id != owner_id';
            }
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'Avatar' AS type, NULL AS location, NULL AS world_name, NULL AS previous_location, NULL AS time, NULL AS group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, owner_id, avatar_name, current_avatar_image_url, current_avatar_thumbnail_image_url, previous_current_avatar_image_url, previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_avatar WHERE (display_name LIKE @searchLike OR avatar_name LIKE @searchLike) ${avatarQuery} ${providerQuery} ${dateQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (online || offline) {
            let query = '';
            if (!online || !offline) {
                if (online) {
                    query = "AND type = 'Online'";
                } else if (offline) {
                    query = "AND type = 'Offline'";
                }
            }
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, type, location, world_name, NULL AS previous_location, time, group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_online_offline WHERE (display_name LIKE @searchLike OR world_name LIKE @searchLike OR group_name LIKE @searchLike) ${query} ${providerQuery} ${dateQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (selects.length === 0) {
            return [];
        }
        const feedDatabase = [];
        const args = {
            '@searchLike': searchLike,
            '@limit': maxEntries,
            '@perTable': maxEntries,
            ...providerArgs,
            ...vipArgs
        };
        if (dateFrom) {
            args['@dateFrom'] = dateFrom;
        }
        if (dateTo) {
            args['@dateTo'] = dateTo;
        }
        await sqliteService.execute(
            (dbRow) => {
                const type = dbRow[5];
                const row = {
                    rowId: dbRow[0],
                    created_at: dbRow[1],
                    userId: dbRow[2],
                    displayName: dbRow[3],
                    provider: dbRow[4],
                    type
                };
                switch (type) {
                    case 'GPS':
                        row.location = dbRow[6];
                        row.worldName = dbRow[7];
                        row.previousLocation = dbRow[8];
                        row.time = dbRow[9];
                        row.groupName = dbRow[10];
                        break;
                    case 'Status':
                        row.status = dbRow[11];
                        row.statusDescription = dbRow[12];
                        row.previousStatus = dbRow[13];
                        row.previousStatusDescription = dbRow[14];
                        break;
                    case 'Bio':
                        row.bio = dbRow[15];
                        row.previousBio = dbRow[16];
                        break;
                    case 'Avatar':
                        row.ownerId = dbRow[17];
                        row.avatarName = dbRow[18];
                        row.currentAvatarImageUrl = dbRow[19];
                        row.currentAvatarThumbnailImageUrl = dbRow[20];
                        row.previousCurrentAvatarImageUrl = dbRow[21];
                        row.previousCurrentAvatarThumbnailImageUrl = dbRow[22];
                        break;
                    case 'Online':
                    case 'Offline':
                        row.location = dbRow[6];
                        row.worldName = dbRow[7];
                        row.time = dbRow[9];
                        row.groupName = dbRow[10];
                        break;
                }
                feedDatabase.push(row);
            },
            `SELECT ${baseColumns} FROM (${selects.join(' UNION ALL ')}) ORDER BY created_at DESC, id DESC LIMIT @limit`,
            args
        );
        return feedDatabase;
    },

    async lookupFeedDatabase(
        filters,
        vipList,
        maxEntries = dbVars.maxTableSize,
        provider = ''
    ) {
        let vipQuery = '';
        const vipArgs = {};
        if (vipList.length > 0) {
            const vipPlaceholders = [];
            vipList.forEach((vip, i) => {
                const key = `@vip_${i}`;
                vipArgs[key] = vip;
                vipPlaceholders.push(key);
            });
            vipQuery = `AND user_id IN (${vipPlaceholders.join(', ')})`;
        }
        const { providerQuery, providerArgs } = buildProviderFilter(provider);
        let gps = true;
        let status = true;
        let bio = true;
        let avatar = true;
        let online = true;
        let offline = true;
        if (filters.length > 0) {
            gps = false;
            status = false;
            bio = false;
            avatar = false;
            online = false;
            offline = false;
            filters.forEach((filter) => {
                switch (filter) {
                    case 'GPS':
                        gps = true;
                        break;
                    case 'Status':
                        status = true;
                        break;
                    case 'Bio':
                        bio = true;
                        break;
                    case 'Avatar':
                        avatar = true;
                        break;
                    case 'Online':
                        online = true;
                        break;
                    case 'Offline':
                        offline = true;
                        break;
                }
            });
        }
        const selects = [];
        const baseColumns = [
            'id',
            'created_at',
            'user_id',
            'display_name',
            'provider',
            'type',
            'location',
            'world_name',
            'previous_location',
            'time',
            'group_name',
            'status',
            'status_description',
            'previous_status',
            'previous_status_description',
            'bio',
            'previous_bio',
            'owner_id',
            'avatar_name',
            'current_avatar_image_url',
            'current_avatar_thumbnail_image_url',
            'previous_current_avatar_image_url',
            'previous_current_avatar_thumbnail_image_url'
        ].join(', ');
        if (gps) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'GPS' AS type, location, world_name, previous_location, time, group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_gps WHERE 1=1 ${providerQuery} ${vipQuery} ORDER BY id DESC LIMIT @perTable)`
            );
        }
        if (status) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'Status' AS type, NULL AS location, NULL AS world_name, NULL AS previous_location, NULL AS time, NULL AS group_name, status, status_description, previous_status, previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_status WHERE 1=1 ${providerQuery} ${vipQuery} ORDER BY id DESC LIMIT @perTable)`
            );
        }
        if (bio) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'Bio' AS type, NULL AS location, NULL AS world_name, NULL AS previous_location, NULL AS time, NULL AS group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, bio, previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_bio WHERE 1=1 ${providerQuery} ${vipQuery} ORDER BY id DESC LIMIT @perTable)`
            );
        }
        if (avatar) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'Avatar' AS type, NULL AS location, NULL AS world_name, NULL AS previous_location, NULL AS time, NULL AS group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, owner_id, avatar_name, current_avatar_image_url, current_avatar_thumbnail_image_url, previous_current_avatar_image_url, previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_avatar WHERE 1=1 ${providerQuery} ${vipQuery} ORDER BY id DESC LIMIT @perTable)`
            );
        }
        if (online || offline) {
            let query = '';
            if (!online || !offline) {
                if (online) {
                    query = "AND type = 'Online'";
                } else if (offline) {
                    query = "AND type = 'Offline'";
                }
            }
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, type, location, world_name, NULL AS previous_location, time, group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_online_offline WHERE 1=1 ${query} ${providerQuery} ${vipQuery} ORDER BY id DESC LIMIT @perTable)`
            );
        }
        if (selects.length === 0) {
            return [];
        }
        const feedDatabase = [];
        const args = {
            '@limit': maxEntries,
            '@perTable': maxEntries,
            ...providerArgs,
            ...vipArgs
        };
        await sqliteService.execute(
            (dbRow) => {
                const type = dbRow[5];
                const row = {
                    rowId: dbRow[0],
                    created_at: dbRow[1],
                    userId: dbRow[2],
                    displayName: dbRow[3],
                    provider: dbRow[4],
                    type
                };
                switch (type) {
                    case 'GPS':
                        row.location = dbRow[6];
                        row.worldName = dbRow[7];
                        row.previousLocation = dbRow[8];
                        row.time = dbRow[9];
                        row.groupName = dbRow[10];
                        break;
                    case 'Status':
                        row.status = dbRow[11];
                        row.statusDescription = dbRow[12];
                        row.previousStatus = dbRow[13];
                        row.previousStatusDescription = dbRow[14];
                        break;
                    case 'Bio':
                        row.bio = dbRow[15];
                        row.previousBio = dbRow[16];
                        break;
                    case 'Avatar':
                        row.ownerId = dbRow[17];
                        row.avatarName = dbRow[18];
                        row.currentAvatarImageUrl = dbRow[19];
                        row.currentAvatarThumbnailImageUrl = dbRow[20];
                        row.previousCurrentAvatarImageUrl = dbRow[21];
                        row.previousCurrentAvatarThumbnailImageUrl = dbRow[22];
                        break;
                    case 'Online':
                    case 'Offline':
                        row.location = dbRow[6];
                        row.worldName = dbRow[7];
                        row.time = dbRow[9];
                        row.groupName = dbRow[10];
                        break;
                }
                feedDatabase.push(row);
            },
            `SELECT ${baseColumns} FROM (${selects.join(' UNION ALL ')}) ORDER BY created_at DESC, id DESC LIMIT @limit`,
            args
        );
        return feedDatabase;
    },

    async getFeedByInstanceId(instanceId, filters, vipList, provider = '') {
        let vipQuery = '';
        const vipArgs = {};
        if (vipList.length > 0) {
            const vipPlaceholders = [];
            vipList.forEach((vip, i) => {
                const key = `@vip_${i}`;
                vipArgs[key] = vip;
                vipPlaceholders.push(key);
            });
            vipQuery = `AND user_id IN (${vipPlaceholders.join(', ')})`;
        }
        const { providerQuery, providerArgs } = buildProviderFilter(provider);
        let gps = true;
        let online = true;
        let offline = true;
        if (filters.length > 0) {
            gps = false;
            online = false;
            offline = false;
            filters.forEach((filter) => {
                switch (filter) {
                    case 'GPS':
                        gps = true;
                        break;
                    case 'Online':
                        online = true;
                        break;
                    case 'Offline':
                        offline = true;
                        break;
                }
            });
        }
        const selects = [];
        const baseColumns = [
            'id',
            'created_at',
            'user_id',
            'display_name',
            'provider',
            'type',
            'location',
            'world_name',
            'previous_location',
            'time',
            'group_name',
            'status',
            'status_description',
            'previous_status',
            'previous_status_description',
            'bio',
            'previous_bio',
            'owner_id',
            'avatar_name',
            'current_avatar_image_url',
            'current_avatar_thumbnail_image_url',
            'previous_current_avatar_image_url',
            'previous_current_avatar_thumbnail_image_url'
        ].join(', ');
        if (gps) {
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, 'GPS' AS type, location, world_name, previous_location, time, group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_gps WHERE location LIKE @instanceLike ${providerQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (online || offline) {
            let query = '';
            if (!online || !offline) {
                if (online) {
                    query = "AND type = 'Online'";
                } else if (offline) {
                    query = "AND type = 'Offline'";
                }
            }
            selects.push(
                `SELECT * FROM (SELECT id, created_at, user_id, display_name, provider, type, location, world_name, NULL AS previous_location, time, group_name, NULL AS status, NULL AS status_description, NULL AS previous_status, NULL AS previous_status_description, NULL AS bio, NULL AS previous_bio, NULL AS owner_id, NULL AS avatar_name, NULL AS current_avatar_image_url, NULL AS current_avatar_thumbnail_image_url, NULL AS previous_current_avatar_image_url, NULL AS previous_current_avatar_thumbnail_image_url FROM ${dbVars.userPrefix}_feed_online_offline WHERE location LIKE @instanceLike ${query} ${providerQuery} ${vipQuery} ORDER BY created_at DESC, id DESC LIMIT @perTable)`
            );
        }
        if (selects.length === 0) {
            return [];
        }
        const feedDatabase = [];
        const args = {
            '@instanceLike': `%${instanceId}%`,
            '@limit': dbVars.searchTableSize,
            '@perTable': dbVars.searchTableSize,
            ...providerArgs,
            ...vipArgs
        };
        await sqliteService.execute(
            (dbRow) => {
                const type = dbRow[5];
                const row = {
                    rowId: dbRow[0],
                    created_at: dbRow[1],
                    userId: dbRow[2],
                    displayName: dbRow[3],
                    provider: dbRow[4],
                    type
                };
                switch (type) {
                    case 'GPS':
                        row.location = dbRow[6];
                        row.worldName = dbRow[7];
                        row.previousLocation = dbRow[8];
                        row.time = dbRow[9];
                        row.groupName = dbRow[10];
                        break;
                    case 'Online':
                    case 'Offline':
                        row.location = dbRow[6];
                        row.worldName = dbRow[7];
                        row.time = dbRow[9];
                        row.groupName = dbRow[10];
                        break;
                }
                feedDatabase.push(row);
            },
            `SELECT ${baseColumns} FROM (${selects.join(' UNION ALL ')}) ORDER BY created_at DESC, id DESC LIMIT @limit`,
            args
        );
        return feedDatabase;
    },

    /**
     * @param {number} days - Number of days to look back
     * @param {number} limit - Max number of worlds to return
     * @returns {Promise<Array>} Ranked list of hot worlds
     */
    async getHotWorlds(days = 30, limit = 30) {
        const halfDays = Math.floor(days / 2);
        const results = [];
        await sqliteService.execute(
            (dbRow) => {
                results.push({
                    worldId: dbRow[0],
                    worldName: dbRow[1],
                    visitCount: dbRow[2],
                    uniqueFriends: dbRow[3],
                    lastVisited: dbRow[4]
                });
            },
            `SELECT
                SUBSTR(location, 1, INSTR(location, ':') - 1) AS world_id,
                world_name,
                COUNT(*) AS visit_count,
                COUNT(DISTINCT user_id) AS unique_friends,
                MAX(created_at) AS last_visited
            FROM ${dbVars.userPrefix}_feed_gps
            WHERE created_at >= datetime('now', @daysOffset)
                AND location LIKE 'wrld_%'
                AND INSTR(location, ':') > 0
                AND world_name IS NOT NULL AND world_name != ''
            GROUP BY world_id
            ORDER BY unique_friends DESC, visit_count DESC
            LIMIT @limit`,
            {
                '@daysOffset': `-${days} days`,
                '@limit': limit
            }
        );

        const trendMap = new Map();
        await sqliteService.execute(
            (dbRow) => {
                trendMap.set(dbRow[0], dbRow[1]);
            },
            `SELECT
                SUBSTR(location, 1, INSTR(location, ':') - 1) AS world_id,
                COUNT(DISTINCT user_id) AS unique_friends
            FROM ${dbVars.userPrefix}_feed_gps
            WHERE created_at >= datetime('now', @daysOffset)
                AND created_at < datetime('now', @halfOffset)
                AND location LIKE 'wrld_%'
                AND INSTR(location, ':') > 0
                AND world_name IS NOT NULL AND world_name != ''
            GROUP BY world_id`,
            {
                '@daysOffset': `-${days} days`,
                '@halfOffset': `-${halfDays} days`
            }
        );

        const recentMap = new Map();
        await sqliteService.execute(
            (dbRow) => {
                recentMap.set(dbRow[0], dbRow[1]);
            },
            `SELECT
                SUBSTR(location, 1, INSTR(location, ':') - 1) AS world_id,
                COUNT(DISTINCT user_id) AS unique_friends
            FROM ${dbVars.userPrefix}_feed_gps
            WHERE created_at >= datetime('now', @halfOffset)
                AND location LIKE 'wrld_%'
                AND INSTR(location, ':') > 0
                AND world_name IS NOT NULL AND world_name != ''
            GROUP BY world_id`,
            {
                '@halfOffset': `-${halfDays} days`
            }
        );

        for (const world of results) {
            const oldFriends = trendMap.get(world.worldId) || 0;
            const newFriends = recentMap.get(world.worldId) || 0;
            if (newFriends > oldFriends) {
                world.trend = 'rising';
            } else if (newFriends < oldFriends) {
                world.trend = 'cooling';
            } else {
                world.trend = 'stable';
            }
        }

        return results;
    },

    /**
     * @param {string} worldId - The world ID (e.g. wrld_xxx)
     * @param {number} days - Number of days to look back
     * @returns {Promise<Array>} List of friends who visited
     */
    async getHotWorldFriendDetail(worldId, days = 30) {
        const results = [];
        await sqliteService.execute(
            (dbRow) => {
                results.push({
                    userId: dbRow[0],
                    displayName: dbRow[1],
                    visitCount: dbRow[2],
                    lastVisit: dbRow[3]
                });
            },
            `SELECT
                user_id,
                display_name,
                COUNT(*) AS visit_count,
                MAX(created_at) AS last_visit
            FROM ${dbVars.userPrefix}_feed_gps
            WHERE SUBSTR(location, 1, INSTR(location, ':') - 1) = @worldId
                AND created_at >= datetime('now', @daysOffset)
            GROUP BY user_id
            ORDER BY visit_count DESC`,
            {
                '@worldId': worldId,
                '@daysOffset': `-${days} days`
            }
        );
        return results;
    }
};

export { feed };
