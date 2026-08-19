const { Pool } = require('pg');

// إعدادات الاتصال بقاعدة البيانات باستخدام متغير البيئة في Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// 1. جلب بيانات المستخدم (لحل خطأ db.getUser)
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

// 2. جلب إعدادات السيرفر
async function getGuildSettings(guildId) {
    try {
        const query = 'SELECT * FROM guild_settings WHERE guild_id = $1';
        const result = await pool.query(query, [guildId]);

        // إذا لم توجد إعدادات سابقة، أرجع كائن فارغ أو القيم الافتراضية
        return result.rows[0] || { guild_id: guildId };
    } catch (err) {
        console.error('Database Error (getGuildSettings):', err);
        return null;
    }
}

// 3. تحديث أو حفظ إعدادات السيرفر
async function updateGuildSetting(guildId, settingKey, settingValue) {
    try {
        // تخزين الإعدادات باستخدام UPSERT (الإدخال أو التحديث إذا كان موجوداً)
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

// تصدير كافة الدوال وقاعدة البيانات للاستخدام في المشروع
module.exports = {
    pool,
    getUser,
    getGuildSettings,
    updateGuildSetting,
    // ... دوالك الأخرى القديمة هنا ...
};