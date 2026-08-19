// ==========================================
// FILE: src/database.js
// ==========================================

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const ALLOWED_SETTINGS = [
    'prefix',
    'welcome_channel',
    'log_channel',
    'ticket_category',
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
            auto_role VARCHAR(32)
        );
    `;
    try {
        await pool.query(query);
    } catch (err) {
        console.error(' Database Initialization Error:', err);
    }
}

initDatabase();

async function getUser(userId) {
    try {
        const query = 'SELECT * FROM users WHERE user_id = $1';
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Database Error (getUser):', err);
        return null;
    }
}

async function getGuildSettings(guildId) {
    try {
        const query = 'SELECT * FROM guild_settings WHERE guild_id = $1';
        const result = await pool.query(query, [guildId]);
        return result.rows[0] || { guild_id: guildId };
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

module.exports = {
    pool,
    getUser,
    getGuildSettings,
    updateGuildSetting
};