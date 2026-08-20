const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const express = require('express');
require('dotenv').config();

const app = express();

// ==========================================
// عميل بوت الديسكورد مع كل الـ Intents
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.commands = new Collection();
client.prefixCommands = new Collection();
client.aliases = new Collection();

// ==========================================
// تحميل الأوامر والإيفنتات
// ==========================================
const commandHandler = require('./handlers/commandHandler');
const eventHandler   = require('./handlers/eventHandler');

(async () => {
    try {
        await commandHandler(client);
        eventHandler(client);
        console.log('[INFO] ✅ تم تحميل الأوامر والإيفنتات بنجاح');
    } catch (err) {
        console.error('[ERROR] فشل تحميل الأوامر/الإيفنتات:', err);
    }
})();

// ==========================================
// تسجيل دخول البوت
// ==========================================
const token = (process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
    console.error('[ERROR] ❌ لم يتم العثور على توكن البوت! تأكد من إضافة BOT_TOKEN في المتغيرات البيئية.');
} else {
    client.login(token).catch((err) => {
        console.error('[ERROR] ⚠️ فشل تسجيل دخول البوت:', err.message);
    });
}

// ==========================================
// الداشبورد + الويب سيرفر
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const mountDashboard = require('./dashboard/server');
mountDashboard(app, client);

// مسار الإحصائيات
app.get('/api/stats', (req, res) => {
    res.json({
        status: client.isReady() ? 'online' : 'offline',
        ping: client.ws?.ping || 0,
        guilds: client.guilds?.cache?.size || 0,
        uptime: client.uptime || 0,
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO] 🚀 Web server running on port ${PORT}`);
});

module.exports = { client };