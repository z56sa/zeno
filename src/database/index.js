// ========================================================
// FILE: src/database/index.js
// قاعدة بيانات SQLite متزامنة (Synchronous) باستخدام better-sqlite3
// ========================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// مجلد البيانات
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'zeno.db'));

// تحسين الأداء
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ==========================================
// إنشاء الجداول
// ==========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '#',
    welcome_channel TEXT,
    welcome_message TEXT,
    welcome_image INTEGER DEFAULT 1,
    log_channel TEXT,
    ticket_category TEXT,
    ticket_log_channel TEXT,
    support_role TEXT,
    auto_role TEXT,
    leveling_enabled INTEGER DEFAULT 1,
    level_message TEXT,
    level_channel TEXT DEFAULT 'current',
    level_multiplier REAL DEFAULT 1.0,
    anti_link INTEGER DEFAULT 0,
    anti_spam INTEGER DEFAULT 0,
    anti_caps INTEGER DEFAULT 0,
    anti_emoji_spam INTEGER DEFAULT 0,
    anti_line_spam INTEGER DEFAULT 0,
    anti_mass_mention INTEGER DEFAULT 0,
    max_mentions INTEGER DEFAULT 4,
    max_emojis INTEGER DEFAULT 5,
    max_lines INTEGER DEFAULT 8,
    bad_words_enabled INTEGER DEFAULT 0,
    bad_words_list TEXT DEFAULT '',
    automod_action TEXT DEFAULT 'warn',
    automod_whitelist_role TEXT,
    automod_whitelist_channel TEXT,
    anti_alt_days INTEGER DEFAULT 0,
    verification_enabled INTEGER DEFAULT 0,
    verification_type TEXT DEFAULT 'button',
    verification_role TEXT,
    anti_nuke_enabled INTEGER DEFAULT 0,
    anti_nuke_action TEXT DEFAULT 'kick',
    temp_voice_enabled INTEGER DEFAULT 0,
    temp_voice_category TEXT,
    temp_voice_channel TEXT,
    boost_enabled INTEGER DEFAULT 1,
    boost_channel TEXT,
    boost_message TEXT DEFAULT '🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts] بوست!',
    boost_dm_enabled INTEGER DEFAULT 0,
    boost_dm_message TEXT DEFAULT 'شكراً جزيلاً لدعمك سيرفر [serverName] بالبوست! 🚀',
    boost_embed_enabled INTEGER DEFAULT 0
  );

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
    PRIMARY KEY (user_id, guild_id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    status TEXT DEFAULT 'open',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    closed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS reaction_roles (
    custom_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS auto_responders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    trigger_word TEXT NOT NULL,
    reply_text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS level_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT UNIQUE,
    prize TEXT NOT NULL,
    winners_count INTEGER DEFAULT 1,
    host_id TEXT NOT NULL,
    end_time INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    entries TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS temp_voices (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    questions TEXT NOT NULL,
    log_channel TEXT,
    accepted_role TEXT,
    status TEXT DEFAULT 'open',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS application_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    answers TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    submitted_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS application_points (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS stars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    giver_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// Migrations - إضافة الأعمدة الجديدة بشكل آمن
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_dm_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_dm_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_embed_enabled INTEGER DEFAULT 0;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_dm_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_dm_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_embed_enabled INTEGER DEFAULT 0;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_type TEXT DEFAULT 'button';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN unverified_role TEXT;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_max_open INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_welcome_msg TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_title TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_desc TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_role TEXT;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN economy_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN daily_amount INTEGER DEFAULT 500;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN work_cooldown INTEGER DEFAULT 4;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN transfer_tax REAL DEFAULT 5.0;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_language TEXT DEFAULT 'ar';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN admin_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN announcements_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN fun_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN autoresponder_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN min_bet INTEGER DEFAULT 10;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN max_bet INTEGER DEFAULT 50000;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN game_rewards_multiplier REAL DEFAULT 1.0;"); } catch(e) {}

console.log('[DB] ✅ SQLite database initialized successfully');

// ==========================================
// Guild Settings
// ==========================================
function getGuildSettings(guildId) {
  let row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row || { guild_id: guildId, prefix: '#' };
}

function setGuildSetting(guildId, key, value) {
  // تأكد السجل موجود
  db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guildId);
  
  // تأكد أن العمود موجود في الجدول، وإذا لم يكن موجوداً يتم إنشاؤه تلقائياً
  try {
    db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
  } catch (err) {
    if (err.message && err.message.includes('no such column')) {
      try {
        const colType = typeof value === 'number' ? 'INTEGER' : 'TEXT';
        db.exec(`ALTER TABLE guild_settings ADD COLUMN ${key} ${colType};`);
        db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
      } catch (addErr) {
        console.error(`Failed to add column ${key}:`, addErr);
      }
    } else {
      console.error(`Failed to update setting ${key}:`, err);
    }
  }
}

// alias
function updateGuildSetting(guildId, key, value) {
  return setGuildSetting(guildId, key, value);
}

// ==========================================
// Users / XP / Economy
// ==========================================
function getUser(userId, guildId) {
  let row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO users (user_id, guild_id) VALUES (?, ?)').run(userId, guildId);
    row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  }
  return row || { user_id: userId, guild_id: guildId, xp: 0, level: 1, coins: 0, reputation: 0, last_daily: 0, last_message_xp: 0, wallpaper: 'default', warnings: 0 };
}

function addXp(userId, guildId, amount) {
  const user = getUser(userId, guildId);
  let xp = (user.xp || 0) + amount;
  let level = user.level || 1;
  let leveledUp = false;

  // معادلة احترافية لحساب الخبرة المطلوبة لكل لفل
  const getRequiredXp = (lvl) => Math.floor(lvl * 150 + 100);

  while (xp >= getRequiredXp(level)) {
    xp -= getRequiredXp(level);
    level += 1;
    leveledUp = true;
  }

  db.prepare(`
    UPDATE users SET xp = ?, level = ?, last_message_xp = ?
    WHERE user_id = ? AND guild_id = ?
  `).run(xp, level, Date.now(), userId, guildId);

  return { level, leveledUp, xp };
}

function addCoins(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
}

function removeCoins(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
}

function setCoins(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET coins = ? WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
}

function setLastDaily(userId, guildId, timestamp) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET last_daily = ? WHERE user_id = ? AND guild_id = ?').run(timestamp, userId, guildId);
}

function setWallpaper(userId, guildId, wallpaper) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET wallpaper = ? WHERE user_id = ? AND guild_id = ?').run(wallpaper, userId, guildId);
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT * FROM users WHERE guild_id = ? ORDER BY xp DESC, level DESC LIMIT ?').all(guildId, limit);
}

function getCoinsLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT * FROM users WHERE guild_id = ? ORDER BY coins DESC LIMIT ?').all(guildId, limit);
}

// ==========================================
// Warnings
// ==========================================
function addWarning(guildId, userId, moderatorId, reason = 'لا يوجد سبب') {
  db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)').run(guildId, userId, moderatorId, reason);
  const count = db.prepare('SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  db.prepare('UPDATE users SET warnings = ? WHERE user_id = ? AND guild_id = ?').run(count.count, userId, guildId);
  return count.count;
}

function getWarnings(guildId, userId) {
  return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(guildId, userId);
}

function clearWarnings(guildId, userId) {
  db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('UPDATE users SET warnings = 0 WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
}

// ==========================================
// Tickets
// ==========================================
function createTicket(guildId, channelId, userId, category = 'General') {
  db.prepare('INSERT OR IGNORE INTO tickets (guild_id, channel_id, user_id, category) VALUES (?, ?, ?, ?)').run(guildId, channelId, userId, category);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function closeTicket(channelId) {
  db.prepare("UPDATE tickets SET status = 'closed', closed_at = strftime('%s','now') WHERE channel_id = ?").run(channelId);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function deleteTicket(channelId) {
  return db.prepare('DELETE FROM tickets WHERE channel_id = ?').run(channelId);
}

function getTicketByChannel(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function getUserActiveTickets(guildId, userId) {
  return db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").all(guildId, userId);
}

function getGuildTickets(guildId, limit = 50) {
  return db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

// ==========================================
// Temp Voice Channels
// ==========================================
function createTempVoice(channelId, guildId, userId) {
  return db.prepare('INSERT OR REPLACE INTO temp_voices (channel_id, guild_id, user_id) VALUES (?, ?, ?)').run(channelId, guildId, userId);
}

function isTempVoice(channelId) {
  const row = db.prepare('SELECT 1 FROM temp_voices WHERE channel_id = ?').get(channelId);
  return !!row;
}

function getTempVoice(channelId) {
  return db.prepare('SELECT * FROM temp_voices WHERE channel_id = ?').get(channelId);
}

function deleteTempVoice(channelId) {
  return db.prepare('DELETE FROM temp_voices WHERE channel_id = ?').run(channelId);
}

// ==========================================
// Applications (نظام التقديمات)
// ==========================================
function createApplication(guildId, title, description, questions, logChannel, acceptedRole) {
  const qStr = typeof questions === 'string' ? questions : JSON.stringify(questions);
  const result = db.prepare(`
    INSERT INTO applications (guild_id, title, description, questions, log_channel, accepted_role)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, title, description, qStr, logChannel, acceptedRole);
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
}

function getApplications(guildId) {
  return db.prepare('SELECT * FROM applications WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

function getApplication(id) {
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
}

function deleteApplication(id) {
  return db.prepare('DELETE FROM applications WHERE id = ?').run(id);
}

function createSubmission(guildId, appId, userId, answers) {
  const aStr = typeof answers === 'string' ? answers : JSON.stringify(answers);
  const result = db.prepare(`
    INSERT INTO application_submissions (guild_id, app_id, user_id, answers)
    VALUES (?, ?, ?, ?)
  `).run(guildId, appId, userId, aStr);
  return db.prepare('SELECT * FROM application_submissions WHERE id = ?').get(result.lastInsertRowid);
}

function getSubmission(id) {
  return db.prepare('SELECT * FROM application_submissions WHERE id = ?').get(id);
}

function getPendingSubmissions(guildId) {
  return db.prepare("SELECT * FROM application_submissions WHERE guild_id = ? AND status = 'pending' ORDER BY id DESC").all(guildId);
}

function updateSubmissionStatus(id, status, reviewedBy) {
  return db.prepare('UPDATE application_submissions SET status = ?, reviewed_by = ? WHERE id = ?').run(status, reviewedBy, id);
}

function getUserApplicationPoints(guildId, userId) {
  const row = db.prepare('SELECT points FROM application_points WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? row.points : 0;
}

function setUserApplicationPoints(guildId, userId, points) {
  return db.prepare('INSERT OR REPLACE INTO application_points (guild_id, user_id, points) VALUES (?, ?, ?)').run(guildId, userId, points);
}

function addApplicationPoint(guildId, userId, amount = 1) {
  const current = getUserApplicationPoints(guildId, userId);
  return setUserApplicationPoints(guildId, userId, current + amount);
}

function resetApplicationPoints(guildId, userId = null) {
  if (userId) {
    return db.prepare('DELETE FROM application_points WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
  return db.prepare('DELETE FROM application_points WHERE guild_id = ?').run(guildId);
}

// ==========================================
// Reaction Roles
// ==========================================
function setReactionRole(customId, guildId, roleId, messageId, channelId) {
  db.prepare('INSERT OR REPLACE INTO reaction_roles (custom_id, guild_id, role_id, message_id, channel_id) VALUES (?, ?, ?, ?, ?)').run(customId, guildId, roleId, messageId, channelId);
}

function getReactionRole(customId) {
  return db.prepare('SELECT * FROM reaction_roles WHERE custom_id = ?').get(customId);
}

function getGuildReactionRoles(guildId) {
  return db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guildId);
}

function deleteReactionRole(customId) {
  db.prepare('DELETE FROM reaction_roles WHERE custom_id = ?').run(customId);
}

// ==========================================
// Auto Responders
// ==========================================
function addAutoResponder(guildId, triggerWord, replyText) {
  db.prepare('INSERT INTO auto_responders (guild_id, trigger_word, reply_text) VALUES (?, ?, ?)').run(guildId, triggerWord.toLowerCase().trim(), replyText);
}

function getAutoResponders(guildId) {
  return db.prepare('SELECT * FROM auto_responders WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

function deleteAutoResponder(guildId, idOrTrigger) {
  if (typeof idOrTrigger === 'number' || !isNaN(idOrTrigger)) {
    db.prepare('DELETE FROM auto_responders WHERE guild_id = ? AND id = ?').run(guildId, Number(idOrTrigger));
  } else {
    db.prepare('DELETE FROM auto_responders WHERE guild_id = ? AND trigger_word = ?').run(guildId, String(idOrTrigger).toLowerCase().trim());
  }
}

// ==========================================
// Level Rewards
// ==========================================
function addLevelReward(guildId, level, roleId) {
  db.prepare('INSERT OR REPLACE INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)').run(guildId, level, roleId);
}

function getLevelRewards(guildId) {
  return db.prepare('SELECT * FROM level_rewards WHERE guild_id = ? ORDER BY level ASC').all(guildId);
}

function removeLevelReward(guildId, level) {
  db.prepare('DELETE FROM level_rewards WHERE guild_id = ? AND level = ?').run(guildId, level);
}

// ==========================================
// Stars
// ==========================================
function addStar(guildId, giverId, receiverId, messageId) {
  // منع التقييم المزدوج
  const exists = db.prepare('SELECT id FROM stars WHERE guild_id = ? AND giver_id = ? AND message_id = ?').get(guildId, giverId, messageId);
  if (exists) return false;
  db.prepare('INSERT INTO stars (guild_id, giver_id, receiver_id, message_id) VALUES (?, ?, ?, ?)').run(guildId, giverId, receiverId, messageId);
  return true;
}

function getStars(guildId, userId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM stars WHERE guild_id = ? AND receiver_id = ?').get(guildId, userId);
  return row ? row.count : 0;
}

// ==========================================
// Giveaways
// ==========================================
function createGiveaway(guildId, channelId, messageId, prize, winnersCount, hostId, endTime) {
  db.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners_count, host_id, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, channelId, messageId, prize, winnersCount, hostId, endTime);
  return db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
}

function getGiveaway(messageId) {
  return db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
}

function getActiveGiveaways() {
  return db.prepare("SELECT * FROM giveaways WHERE status = 'active' AND end_time <= ?").all(Date.now());
}

function updateGiveawayEntries(messageId, entries) {
  db.prepare('UPDATE giveaways SET entries = ? WHERE message_id = ?').run(JSON.stringify(entries), messageId);
}

function endGiveaway(messageId) {
  db.prepare("UPDATE giveaways SET status = 'ended' WHERE message_id = ?").run(messageId);
}

// ==========================================
// Stats
// ==========================================
function getSystemStats() {
  const users = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM users').get();
  const guilds = db.prepare('SELECT COUNT(*) as count FROM guild_settings').get();
  const tickets = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get();
  return {
    totalUsers: users?.count || 0,
    totalGuilds: guilds?.count || 0,
    openTickets: tickets?.count || 0
  };
}

// ==========================================
// Export
// ==========================================
module.exports = {
  db,
  getGuildSettings,
  setGuildSetting,
  updateGuildSetting,
  getUser,
  addXp,
  addCoins,
  removeCoins,
  setCoins,
  setLastDaily,
  setWallpaper,
  getLeaderboard,
  getCoinsLeaderboard,
  addWarning,
  getWarnings,
  clearWarnings,
  createTicket,
  closeTicket,
  deleteTicket,
  getTicket: getTicketByChannel,
  getTicketByChannel,
  getUserActiveTickets,
  getGuildTickets,
  createTempVoice,
  isTempVoice,
  getTempVoice,
  deleteTempVoice,
  setReactionRole,
  getReactionRole,
  getGuildReactionRoles,
  deleteReactionRole,
  addAutoResponder,
  getAutoResponders,
  deleteAutoResponder,
  addLevelReward,
  getLevelRewards,
  removeLevelReward,
  addStar,
  getStars,
  createApplication,
  getApplications,
  getApplication,
  deleteApplication,
  createSubmission,
  getSubmission,
  getPendingSubmissions,
  updateSubmissionStatus,
  getUserApplicationPoints,
  setUserApplicationPoints,
  addApplicationPoint,
  resetApplicationPoints,
  // Compatibility aliases
  getTopXp: getLeaderboard,
  getTopCredits: getCoinsLeaderboard,
  addCredits: addCoins,
  getUserRank: (userId, guildId) => {
    const user = getUser(userId, guildId);
    return { xp: user.xp || 0, level: user.level || 1, rank: 1 };
  },
  getWallpaper: (userId) => 'default',
  setDaily: (userId, guildId, now, amount) => {
    addCoins(userId, guildId, amount);
    setLastDaily(userId, guildId, now);
    const u = getUser(userId, guildId);
    return u.coins || 0;
  }
};