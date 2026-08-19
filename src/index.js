const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const path = require('path');
const { getSystemStats } = require('./database');

const app = express();

// 1. تعريف مجلد الملفات الثابتة (HTML / CSS / JS)
const publicDir = path.join(__dirname, 'dashboard', 'public');
app.use(express.static(publicDir));

// 2. توجيه الصفحة الرئيسية لفتح index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

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

// تشغيل سيرفر الويب
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dashboard server running on port ${PORT}`));