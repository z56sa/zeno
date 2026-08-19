// ==========================================
// FILE: src/index.js
// ==========================================

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const app = require('./dashboard/server');
const db = require('./database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();

// لمراقبة حالة البوت API مسار
app.get('/api/stats', (req, res) => {
    res.json({
        status: 'online',
        guildsCount: client.guilds.cache.size || 0,
        usersCount: client.users.cache.size || 0,
        ping: client.ws.ping || 0
    });
});

// قراءة التوكن ودعم متغير Railway (BOT_TOKEN)
const token = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!token) {
    console.error('❌ خطأ: لم يتم العثور على التوكن في متغيرات البيئة! تأكد من إضافة BOT_TOKEN على Railway.');
} else {
    client.login(token);
}