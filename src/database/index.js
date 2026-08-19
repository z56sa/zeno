// ==========================================
// FILE: src/index.js
// ==========================================

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./database');

// ------------------------------------------
// 1. EXPRESS & WEB SERVER SETUP
// ------------------------------------------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------
// 2. DISCORD CLIENT INITIALIZATION
// ------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.cooldowns = new Collection();

// تمرير app و client بأمان للوحة التحكم
try {
    const dashboardServer = require('./dashboard/server');
    if (typeof dashboardServer === 'function') {
        dashboardServer(app, client);
    }
} catch (err) {
    console.warn('⚠️ لم يتم تحميل ملف الداشبورد أو أنه يحتوي على هيكلة مختلفة:', err.message);
}

// ------------------------------------------
// 3. API ENDPOINTS (RAILWAY & MONITORING)
// ------------------------------------------
app.get('/api/stats', async (req, res) => {
    try {
        const dbStats = typeof db.getSystemStats === 'function' ? await db.getSystemStats() : {};

        res.json({
            status: client.user ? 'online' : 'connecting',
            ping: client.ws?.ping || 0,
            guildsCount: client.guilds?.cache?.size || 0,
            usersCount: client.users?.cache?.size || 0,
            dbStats: dbStats,
            uptime: Math.floor(process.uptime())
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bot statistics' });
    }
});

// ------------------------------------------
// 4. DYNAMIC HANDLERS (COMMANDS & EVENTS)
// ------------------------------------------
const loadBotModules = () => {
    // 1. تحميل الأحداث (Events)
    const eventsPath = path.join(__dirname, 'events');
    if (fs.existsSync(eventsPath)) {
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
        for (const file of eventFiles) {
            const event = require(path.join(eventsPath, file));
            if (event.name && typeof event.execute === 'function') {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
            }
        }
        console.log(`✅ Loaded ${eventFiles.length} events successfully.`);
    }

    // 2. تحميل الأوامر (Commands / Slash Commands)
    const commandsPath = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsPath)) {
        const categories = fs.readdirSync(commandsPath);
        let commandCount = 0;

        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);

            if (fs.statSync(categoryPath).isDirectory()) {
                const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
                for (const file of commandFiles) {
                    const command = require(path.join(categoryPath, file));

                    // دعم أوامر السلاش (Slash) والأوامر العادية (Prefix)
                    if (command.data && command.execute) {
                        client.slashCommands.set(command.data.name, command);
                        commandCount++;
                    } else if (command.name && command.execute) {
                        client.commands.set(command.name, command);
                        commandCount++;
                    }
                }
            }
        }
        console.log(`✅ Loaded ${commandCount} bot commands.`);
    }
};

loadBotModules();

// ------------------------------------------
// 5. ANTI-CRASH SYSTEM (STABILITY)
// ------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});

// ------------------------------------------
// 6. START SERVER & LOGIN
// ------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Web server running on port ${PORT}`);
});

const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
    console.error('❌ Critical Error: Bot Token is missing in environment variables!');
} else {
    client.login(TOKEN);
}