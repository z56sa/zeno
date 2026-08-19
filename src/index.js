// ==========================================
// FILE: src/index.js
// ==========================================

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const app = require('./dashboard/server'); // استدعاء سيرفر Express
const db = require('./database');           // استدعاء ملف قاعدة البيانات

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

// مسار API لمراقبة حالة البوت
app.get('/api/stats', (req, res) => {
    res.json({
        status: 'online',
        guildsCount: client.guilds.cache.size || 0,
        usersCount: client.users.cache.size || 0,
        ping: client.ws.ping || 0
    });
});

// تسجيل دخول البوت
client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);