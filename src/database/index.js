// ======================================================================
// FILE: src/database/index.js - PostgreSQL Database Connection
// ======================================================================

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    console.log('[DATABASE] Connected to PostgreSQL database successfully.');
});

pool.on('error', (err) => {
    console.error('[DATABASE ERROR] Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};