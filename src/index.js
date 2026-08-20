const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const path = require('path');
const { getSystemStats } = require('./database');

const app = express();

// عميل بوت الديسكورد
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        // أضف بقية الـ intents اللي يحتاجها بوتك هنا (Members, MessageContent...الخ)
    ],
});
client.commands = new Collection();

// تسجيل دخول البوت
client.login(process.env.BOT_TOKEN).catch((err) => {
    console.error('⚠️ فشل تسجيل دخول البوت:', err.message);
});

// تم حذف توجيه الـ index.html الثابت لكي يعمل سيرفر الداشبورد الديناميكي بكفاءة
app.use(express.static('public'));

// تركيب الداشبورد على نفس تطبيق express (وليس استدعاءه ككائن منفصل)
const mountDashboard = require('./dashboard/server');
mountDashboard(app, client);

// مسار الإحصائيات
app.get('/api/stats', async (req, res) => {
    const dbStats = await getSystemStats();
    res.json({
        status: 'online',
        ping: client.ws?.ping || 0,
        ...dbStats,
    });
});

// تشغيل سيرفر الويب
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dashboard server running on port ${PORT}`));

module.exports = { client };