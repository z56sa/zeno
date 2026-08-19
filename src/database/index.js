// ==========================================
// FILE: src/database/index.js
// ==========================================

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.warn('⚠️ تحذير: متغير البيئة DATABASE_URL غير معرف!');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const ALLOWED_SETTINGS = [
    'prefix',
    'welcome_channel',
    'log_channel',
    'ticket_category',
    'ticket_log_channel',
    'support_role',
    'auto_role'
];

async function initDatabase() {
    const query = `
        CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(32) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id VARCHAR(32) PRIMARY KEY,
            prefix VARCHAR(10) DEFAULT '!',
            welcome_channel VARCHAR(32),
            log_channel VARCHAR(32),
            ticket_category VARCHAR(32),
            ticket_log_channel VARCHAR(32),
            support_role VARCHAR(32),
            auto_role VARCHAR(32)
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            guild_id VARCHAR(32) NOT NULL,
            channel_id VARCHAR(32) NOT NULL UNIQUE,
            user_id VARCHAR(32) NOT NULL,
            category VARCHAR(64) DEFAULT 'General',
            status VARCHAR(16) DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        );
    `;
    try {
        await pool.query(query);
        console.log('✅ تم تجهيز قاعدة البيانات والجداول بنجاح.');
    } catch (err) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', err);
    }
}

initDatabase();

async function getUser(userId) {
    try {
        const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Database Error (getUser):', err);
        return null;
    }
}

async function createUser(userId) {
    try {
        const result = await pool.query(
            'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING *;',
            [userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Database Error (createUser):', err);
        return null;
    }
}

async function getGuildSettings(guildId) {
    try {
        const result = await pool.query('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
        return result.rows[0] || { guild_id: guildId, prefix: '!' };
    } catch (err) {
        console.error('Database Error (getGuildSettings):', err);
        return null;
    }
}

async function updateGuildSetting(guildId, settingKey, settingValue) {
    if (!ALLOWED_SETTINGS.includes(settingKey)) {
        throw new Error(`حقل غير مصرح بتعديله: ${settingKey}`);
    }
    try {
        const query = `
            INSERT INTO guild_settings (guild_id, ${settingKey})
            VALUES ($1, $2)
            ON CONFLICT (guild_id) 
            DO UPDATE SET ${settingKey} = $2;
        `;
        await pool.query(query, [guildId, settingValue]);
    } catch (err) {
        console.error('Database Error (updateGuildSetting):', err);
        throw err;
    }
}

async function createTicket(guildId, channelId, userId, category = 'General') {
    try {
        const query = `
            INSERT INTO tickets (guild_id, channel_id, user_id, category, status)
            VALUES ($1, $2, $3, $4, 'open')
            RETURNING *;
        `;
        const result = await pool.query(query, [guildId, channelId, userId, category]);
        return result.rows[0];
    } catch (err) {
        console.error('Database Error (createTicket):', err);
        throw err;
    }
}

async function closeTicket(channelId) {
    try {
        const query = `
            UPDATE tickets 
            SET status = 'closed', closed_at = CURRENT_TIMESTAMP 
            WHERE channel_id = $1
            RETURNING *;
        `;
        const result = await pool.query(query, [channelId]);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Database Error (closeTicket):', err);
        throw err;
    }
}

async function getTicketByChannel(channelId) {
    try {
        const result = await pool.query('SELECT * FROM tickets WHERE channel_id = $1', [channelId]);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Database Error (getTicketByChannel):', err);
        return null;
    }
}

async function getUserActiveTickets(guildId, userId) {
    try {
        const result = await pool.query(
            "SELECT * FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status = 'open';",
            [guildId, userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Database Error (getUserActiveTickets):', err);
        return [];
    }
}

async function getGuildTickets(guildId, limit = 50) {
    try {
        const result = await pool.query(
            'SELECT * FROM tickets WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2;',
            [guildId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Database Error (getGuildTickets):', err);
        return [];
    }
}

async function getSystemStats() {
    try {
        const usersCount = await pool.query('SELECT COUNT(*) FROM users');
        const guildsCount = await pool.query('SELECT COUNT(*) FROM guild_settings');
        const openTicketsCount = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'open'");

        return {
            totalUsers: parseInt(usersCount.rows[0].count, 10) || 0,
            totalGuilds: parseInt(guildsCount.rows[0].count, 10) || 0,
            openTickets: parseInt(openTicketsCount.rows[0].count, 10) || 0
        };
    } catch (err) {
        console.error('Database Error (getSystemStats):', err);
        return { totalUsers: 0, totalGuilds: 0, openTickets: 0 };
    }
}

module.exports = {
    pool,
    initDatabase,
    getUser,
    createUser,
    getGuildSettings,
    updateGuildSetting,
    createTicket,
    closeTicket,
    getTicketByChannel,
    getUserActiveTickets,
    getGuildTickets,
    getSystemStats
};