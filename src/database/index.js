// مثال لكيفية إضافة وتصدير دوال إعدادات السيرفر في src/database/index.js

// (افترض أنك تستخدم مكتبة pg أو pool للاتصال بقاعدة البيانات)
const { Pool } = require('pg');
const pool = new Pool({ /* إعدادات الاتصال لديك */ });

// 1. جلب إعدادات السيرفر
async function getGuildSettings(guildId) {
    try {
        const query = 'SELECT * FROM guild_settings WHERE guild_id = $1';
        const result = await pool.query(query, [guildId]);

        // إذا لمويجد إعدادات سابقة، أرجع كائن فارغ أو القيم الافتراضية
        return result.rows[0] || { guild_id: guildId };
    } catch (err) {
        console.error('Database Error (getGuildSettings):', err);
        return null;
    }
}

// 2. تحديث أو حفظ إعدادات السيرفر
async function updateGuildSetting(guildId, settingKey, settingValue) {
    try {
        // مثال لتخزين الإعدادات باستخدام UPSERT (الإدخال أو التحديث إذا كان موجوداً)
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

// تأكد من تصدير هذه الدوال مع بقية الدوال لديك في النهاية:
module.exports = {
    pool,
    getGuildSettings,
    updateGuildSetting,
    // ... دوالك الأخرى القديمة هنا ...
};