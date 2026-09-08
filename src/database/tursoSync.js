/**
 * @module tursoSync
 * @description Background synchronization between local SQLite (better-sqlite3) and remote Turso database.
 * Ensures that coins, XP, daily streak, and essential settings persist across Render redeploys and crashes.
 */

const { createClient } = require('@libsql/client');

class TursoSync {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.syncQueue = [];
    this.isProcessingQueue = false;

    const url = (process.env.TURSO_DATABASE_URL || '').trim();
    const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

    if (url && (url.startsWith('libsql://') || url.startsWith('https://'))) {
      try {
        this.client = createClient({
          url,
          authToken: authToken || undefined,
        });
        this.enabled = true;
        console.log('[TURSO] 🌐 Turso Cloud Database Sync initialized successfully.');
      } catch (err) {
        console.error('[TURSO] ⚠️ Failed to initialize Turso client:', err.message);
      }
    } else {
      console.log('[TURSO] ℹ️ Turso credentials not detected. Running on local SQLite only.');
    }
  }

  /**
   * Initializes tables on Turso and restores data into local SQLite at startup
   */
  async initAndRestore(localDb) {
    if (!this.enabled || !this.client) return;

    try {
      // 1. Create essential persistent tables in Turso
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          xp INTEGER DEFAULT 0,
          level INTEGER DEFAULT 1,
          coins INTEGER DEFAULT 0,
          reputation INTEGER DEFAULT 0,
          last_daily INTEGER DEFAULT 0,
          last_message_xp INTEGER DEFAULT 0,
          wallpaper TEXT DEFAULT 'default',
          warnings INTEGER DEFAULT 0,
          streak INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, guild_id)
        );
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS guild_settings (
          guild_id TEXT PRIMARY KEY,
          prefix TEXT DEFAULT '#',
          welcome_channel TEXT,
          log_channel TEXT,
          economy_enabled INTEGER DEFAULT 1
        );
      `);

      console.log('[TURSO] ✅ Turso remote tables verified.');

      // 2. Restore users data from Turso to local SQLite (Restoring coins/streak/XP after container restart)
      const usersResult = await this.client.execute('SELECT * FROM users');
      if (usersResult.rows && usersResult.rows.length > 0) {
        console.log(`[TURSO] 🔄 Restoring ${usersResult.rows.length} users from Turso into local SQLite...`);
        const insertOrReplace = localDb.prepare(`
          INSERT INTO users (user_id, guild_id, xp, level, coins, reputation, last_daily, last_message_xp, wallpaper, warnings, streak)
          VALUES (@user_id, @guild_id, @xp, @level, @coins, @reputation, @last_daily, @last_message_xp, @wallpaper, @warnings, @streak)
          ON CONFLICT(user_id, guild_id) DO UPDATE SET
            coins = MAX(users.coins, excluded.coins),
            xp = MAX(users.xp, excluded.xp),
            level = MAX(users.level, excluded.level),
            last_daily = MAX(users.last_daily, excluded.last_daily),
            streak = MAX(users.streak, excluded.streak);
        `);

        const restoreTransaction = localDb.transaction((rows) => {
          for (const row of rows) {
            insertOrReplace.run({
              user_id: String(row.user_id),
              guild_id: String(row.guild_id),
              xp: Number(row.xp || 0),
              level: Number(row.level || 1),
              coins: Number(row.coins || 0),
              reputation: Number(row.reputation || 0),
              last_daily: Number(row.last_daily || 0),
              last_message_xp: Number(row.last_message_xp || 0),
              wallpaper: String(row.wallpaper || 'default'),
              warnings: Number(row.warnings || 0),
              streak: Number(row.streak || 0)
            });
          }
        });

        restoreTransaction(usersResult.rows);
        console.log('[TURSO] 🎉 Data restoration complete! All gold and users successfully preserved.');
      } else {
        // If Turso is currently empty, push existing local users to Turso
        console.log('[TURSO] ℹ️ Turso is currently empty. Initializing remote database with local data...');
        this.backupAllLocalUsers(localDb);
      }
    } catch (err) {
      console.error('[TURSO] ⚠️ Error during initAndRestore:', err.message);
    }
  }

  /**
   * Syncs a specific user's latest coins, streak, and daily state immediately to Turso
   */
  queueUserSync(userData) {
    if (!this.enabled || !this.client || !userData || !userData.user_id) return;

    const sql = `
      INSERT INTO users (user_id, guild_id, xp, level, coins, reputation, last_daily, last_message_xp, wallpaper, warnings, streak)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, guild_id) DO UPDATE SET
        coins = excluded.coins,
        xp = excluded.xp,
        level = excluded.level,
        last_daily = excluded.last_daily,
        streak = excluded.streak;
    `;
    const args = [
      String(userData.user_id),
      String(userData.guild_id || 'global'),
      Number(userData.xp || 0),
      Number(userData.level || 1),
      Number(userData.coins || 0),
      Number(userData.reputation || 0),
      Number(userData.last_daily || 0),
      Number(userData.last_message_xp || 0),
      String(userData.wallpaper || 'default'),
      Number(userData.warnings || 0),
      Number(userData.streak || 0)
    ];

    this.enqueue({ sql, args });
  }

  /**
   * Pushes all local users to Turso
   */
  async backupAllLocalUsers(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const rows = localDb.prepare('SELECT * FROM users').all();
      for (const row of rows) {
        this.queueUserSync(row);
      }
    } catch (e) {}
  }

  enqueue(statement) {
    this.syncQueue.push(statement);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessingQueue || this.syncQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.syncQueue.length > 0) {
      const batch = this.syncQueue.splice(0, 20); // Process up to 20 statements in a batch
      try {
        await this.client.batch(batch, 'write');
      } catch (err) {
        console.error('[TURSO] Sync batch failed:', err.message);
      }
    }

    this.isProcessingQueue = false;
  }
}

module.exports = new TursoSync();
