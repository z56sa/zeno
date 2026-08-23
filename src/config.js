// ----------------------------------------------
// CONFIGURATION HANDLER: Loads all settings from DB/File
// ----------------------------------------------
const { Client } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma Client
const prisma = new PrismaClient();

/**
 * Fetches all operational settings for a given Guild ID.
 * @param {string} guildId - The ID of the server.
 * @returns Promise<{ isModerationEnabled: boolean, profanityConfig: object }>
 */
async function getGuildSettings(guildId) {
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId }
        });

        if (!settings) {
            console.warn(`[CONFIG] No settings found for Guild ID: ${guildId}. Using defaults.`);
            return {
                isModerationEnabled: true,
                profanityConfig: {
                    enabled: true,
                    bannedWords: ["كلمة1", "كلمة2"],
                    actionType: "warning"
                }
            };
        }

        // معالجة الكلمات الممنوعة لضمان عدم حدوث خطأ إذا كانت مصفوفة أو نص JSON
        let parsedBannedWords = ["كلمة1", "كلمة2"];
        try {
            if (typeof settings.bannedWords === 'string') {
                parsedBannedWords = JSON.parse(settings.bannedWords);
            } else if (Array.isArray(settings.bannedWords)) {
                parsedBannedWords = settings.bannedWords;
            }
        } catch (e) {
            parsedBannedWords = ["كلمة1", "كلمة2"];
        }

        return {
            isModerationEnabled: settings.isModerationEnabled,
            profanityConfig: {
                enabled: settings.profanityFilterEnabled,
                bannedWords: parsedBannedWords,
                actionType: settings.profanityActionType
            }
        };

    } catch (error) {
        console.error("[CONFIG ERROR] Failed to load guild settings:", error);
        return {
            isModerationEnabled: true,
            profanityConfig: {
                enabled: true,
                bannedWords: ["كلمة1", "كلمة2"],
                actionType: "warning"
            }
        };
    }
}

module.exports = { getGuildSettings };