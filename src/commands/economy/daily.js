const { createClient } = require("@libsql/client");

// الاتصال بقاعدة بيانات Turso باستخدام متغيرات البيئة
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// إنشاء الجداول تلقائياً عند تشغيل البوت
async function initDatabase() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT,
        guild_id TEXT,
        coins INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        last_daily INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, guild_id)
      )
    `);
    console.log("✅ تم الاتصال بقاعدة بيانات Turso وإنشاء الجداول بنجاح!");
  } catch (error) {
    console.error("❌ خطأ أثناء إنشاء جداول قاعدة البيانات:", error);
  }
}

initDatabase();

// دالة لجلب بيانات المستخدم أو إنشائه إن لم يكن موجوداً
async function getUser(userId, guildId) {
  try {
    const result = await db.execute({
      sql: "SELECT * FROM users WHERE user_id = ? AND guild_id = ?",
      args: [userId, guildId]
    });

    if (result.rows.length === 0) {
      // إذا لم يكن المستخدم موجوداً، نقوم بإنشائه بقيم افتراضية
      await db.execute({
        sql: "INSERT INTO users (user_id, guild_id, coins, streak, last_daily) VALUES (?, ?, 0, 0, 0)",
        args: [userId, guildId]
      });
      return { user_id: userId, guild_id: guildId, coins: 0, streak: 0, last_daily: 0 };
    }

    return result.rows[0];
  } catch (error) {
    console.error("خطأ في دالة getUser:", error);
    return { coins: 0, streak: 0, last_daily: 0 };
  }
}

// دالة لجلب وقت آخر مكافأة يومية
async function getLastDaily(userId, guildId) {
  const user = await getUser(userId, guildId);
  return user.last_daily || 0;
}

// دالة لإضافة الرصيد (الذهب/Coins)
async function addCoins(userId, guildId, amount) {
  try {
    // التأكد من وجود المستخدم أولاً
    await getUser(userId, guildId);

    await db.execute({
      sql: "UPDATE users SET coins = coins + ? WHERE user_id = ? AND guild_id = ?",
      args: [amount, userId, guildId]
    });
  } catch (error) {
    console.error("خطأ في دالة addCoins:", error);
  }
}

// دالة لتحديث وقت الـ Daily والـ Streak
async function setDailyData(userId, guildId, timestamp, streak) {
  try {
    await db.execute({
      sql: "UPDATE users SET last_daily = ?, streak = ? WHERE user_id = ? AND guild_id = ?",
      args: [timestamp, streak, userId, guildId]
    });
  } catch (error) {
    console.error("خطأ في دالة setDailyData:", error);
  }
}

module.exports = {
  db,
  getUser,
  getLastDaily,
  addCoins,
  setDailyData
};  