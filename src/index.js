// ======================================================================
// FILE: src/index.js - THE SINGLE ENTRY POINT (OPTIMIZED VERSION)
// ======================================================================

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const app = require('./dashboard/server');

const PORT = process.env.PORT || 3000;

// إنشاء عميل ديسكورد (Discord Client)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    // إضافة خيارات لتقليل المشاكل الشبكية وتحسين استقرار الـ WebSocket
    restTimeOffset: 0,
    failIfNotExists: false,
    allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false
    }
});

client.commands = new Collection();
client.prefixCommands = new Collection();
client.aliases = new Collection();

// ==========================================
// تشغيل معالجات الأوامر والأحداث (Handlers)
// ==========================================
try {
    const commandHandler = require('./handlers/commandHandler');
    const eventHandler = require('./handlers/eventHandler');

    commandHandler(client);
    eventHandler(client);
    console.log('📂 Handlers initialization triggered successfully!');
} catch (err) {
    console.error('❌ Error loading handlers:', err);
}

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

// قراءة وتنظيف التوكن لمنع أي مشاكل في المسافات
const rawToken = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const token = rawToken ? rawToken.trim() : '';

console.log('🔍 Checking Token Status...');
if (token) {
    console.log('🔑 Token found! Attempting to login to Discord...');
    console.log('🌐 Node Environment:', process.env.NODE_ENV || 'development');

    client.login(token)
        .then(() => {
            console.log(`🎉 SUCCESS: Logged in successfully as ${client.user.tag}!`);
        })
        .catch(err => {
            console.error('❌ CRITICAL LOGIN ERROR:', err);
        });
} else {
    console.log('🚨 ERROR: Bot Token is completely missing from environment variables!');
}

module.exports = { client, app };