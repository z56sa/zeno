const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const { getSystemStats } = require('./database');

const app = express();

// استدعاء الداشبورد
const dashboardServer = require('./dashboard/server');
if (typeof dashboardServer === 'function') {
    dashboardServer(app);
}

// مسار الإحصائيات
app.get('/api/stats', async (req, res) => {
    const dbStats = await getSystemStats();
    res.json({
        status: 'online',
        ping: client.ws?.ping || 0,
        ...dbStats
    });
});

// تشغيل سيرفر الويب على المنفذ المحدد
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dashboard server running on port ${PORT}`));

// ... كود تهيئة Discord Client وتسجيل الدخول يكتمل هنا ...