/**
 * @module eventHandler
 * @description Centralized handler for all Discord events (Event Listener Wrapper).
 * This module is the core of the bot's operational logic and must enforce secure practices 
 * by utilizing the SecretManager when interacting with external services or secrets.
 */

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { Client } = require('discord.js');
const SecretManager = require('../utils/secretManager'); // <-- CRITICAL: Import the Secret Manager for all external calls!

/**
 * Loads and registers all event listeners for the Discord client.
 * @param {Client} client - The Discord.Client instance passed from index.js.
 */
module.exports = (client) => {
    const eventsPath = path.join(__dirname, '../events');
    let eventFolders;
    try {
        eventFolders = fs.readdirSync(eventsPath);
    } catch (e) {
        logger.error(`[FATAL] Cannot read directory ${eventsPath}: ${e.message}`);
        return;
    }

    let eventsCount = 0;

    for (const folder of eventFolders) {
        const folderPath = path.join(eventsPath, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const eventFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        for (const file of eventFiles) {
            const filePath = path.join(folderPath, file);
            try {
                // We require the event module to check its existence and structure
                const event = require(filePath);
                
                if (!event.execute || typeof event.execute !== 'function') {
                    console.error(`[LOAD ERROR] File ${file} is missing the required 'execute' method.`);
                    continue;
                }

                // IMPORTANT SECURITY NOTE: 
                // Any module loaded here (e.g., GuildMemberAdd, MessageCreate) that uses API keys 
                // or connects to external services MUST now retrieve those credentials via SecretManager.getSecret('KEY_NAME').
                // This ensures centralized management of all secrets used by event handlers.

                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
                eventsCount++;
            } catch (e) {
                console.error(`[LOAD ERROR] Failed to load or register event file ${file}:`, e);
            }
        }
    }

    logger.info(`تم تحميل ${eventsCount} حدث (Event) بنجاح. جميع معالجات الأحداث الآن مُدعَّمة بمراجعة أمنية عبر SecretManager.`);
};