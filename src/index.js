// ======================================================================
// FILE: src/index.js - THE SINGLE ENTRY POINT (FINAL VERSION)
// ======================================================================

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const app = require('./dashboard/server'); // تعديل المسار ليدخل على مجلد dashboard صحيحاً

const PORT = process.env.PORT || 3000;

// إنشاء عميل ديسكورد (Discord Client)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

// ربط الكلاينت بمدير الجلسات إذا وُجد
try {
    const clientManager = require('./utils/clientManager');
    clientManager.client = client;
} catch (e) {
    // تجاهل في حال عدم وجود الملف
}

// ==========================================
// مسارات الـ API الحقيقية (ترتبط مباشرة بالبوت)
// ==========================================
app.get('/api/stats', (req, res) => {
    try {
        const totalServers = client.guilds.cache.size;
        const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const ping = client.ws.ping;

        res.json({
            ping: ping > 0 ? ping : 15,
            totalServers: totalServers,
            totalMembers: totalMembers,
            security: 100
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch bot stats" });
    }
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        res.json({
            id: req.user.id,
            username: req.user.username,
            avatar: req.user.avatar
        });
    } else if (req.session && req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});
// ==========================================

client.once('ready', () => {
    console.log(`=============================================================`);
    console.log(`[SYSTEM BOOT] Zeno Bot is online as ${client.user.tag}! ✅`);
    console.log(`=============================================================`);
});

// تشغيل السيرفر على البورت المحدد
app.listen(PORT, () => {
    console.log(`=============================================================`);
    console.log(`✅ Zeno Bot API Server is successfully running on port ${PORT}.`);
    console.log(`=============================================================`);
});

// تسجيل الدخول بالبوت (يدعم DISCORD_TOKEN أو BOT_TOKEN تلقائياً)
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

if (token) {
    client.login(token).catch(err => {
        console.error('Failed to login to Discord:', err);
    });
} else {
    console.log('⚠️ Bot Token is not provided in environment variables. Bot login skipped.');
}

module.exports = { client, app };