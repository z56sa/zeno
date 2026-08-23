/**
 * @module index
 * @description Main entry point for the zeno bot. Manages Discord client initialization, event handlers, and web server setup.
 */

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const express = require('express');
// Import SecretManager first to enforce security checks immediately upon load
const SecretManager = require('./utils/secretManager'); 
require('dotenv').config(); // Keep dotenv for local development setup

const app = express();

// =============================================================================
// Discord Client Initialization and Security Check
// =============================================================================

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


// =============================================================================
// Initialization Sequence (The Core Logic)
// =============================================================================

(async () => {
    console.log('[INFO] 🚀 Starting Bot Initialization Sequence...');
    
    try {
        // --- 1. Security Check (Mandatory Step): Validate all critical secrets ---
        const requiredTokens = ['DISCORD_BOT_TOKEN', 'DATABASE_URL']; // Add any other critical secrets here
        SecretManager.checkAllRequiredSecrets(requiredTokens);
        console.log('[SECURITY] ✅ All mandatory environment variables checked and passed.');

        // --- 2. Loading Handlers (Must run only after security check passes) ---
        const commandHandler = require('./handlers/commandHandler');
        const eventHandler   = require('./handlers/eventHandler');
        await commandHandler(client);
        eventHandler(client);
        console.log('[INFO] ✅ Successfully loaded commands and event handlers.');

    } catch (err) {
        // This handles both the SecretManager error and any other setup failure
        console.error('[CRITICAL FAILURE] 🛑 Initialization failed due to missing or invalid configuration:', err.message);
        // Stop execution if initialization fails critically
        process.exit(1); 
    }
})();


// =============================================================================
// Login and Connection (Uses SecretManager)
// =============================================================================

/**
 * Securely retrieves the bot token using SecretManager.
 * @returns {string | null} The retrieved token or null if unavailable.
 */
function getBotToken() {
    // Use a standardized name for the primary Discord token across all environments (Railway, Local)
    return SecretManager.getSecret('DISCORD_BOT_TOKEN'); 
}

const token = getBotToken();

if (!token) {
    console.error('[ERROR] ❌ Failed to retrieve Bot Token from the secret manager. The bot cannot connect.');
} else {
    // Attempt login only if the token is successfully retrieved
    client.login(token).catch((err) => {
        console.error('[ERROR] ⚠️ Could not log in to Discord:', err.message);
    });
}


// =============================================================================
// Dashboard + Web Server Setup (Web Interface Layer)
// =============================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


const mountDashboard = require('./dashboard/server');
mountDashboard(app, client);


// API Route for Stats (Keep this stateless)
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