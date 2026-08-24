/**
 * @module autoBroadcaster
 * @description نظام المذيع الآلي - يرسل رسائل دورية تلقائياً حسب إعدادات كل سيرفر
 * Zero-Downtime: يقرأ الإعدادات من DB في كل دورة بدون إعادة تشغيل
 */

const { EmbedBuilder } = require('discord.js');
const database = require('../database');

class AutoBroadcaster {
    constructor(client) {
        this.client = client;
        this.lastSent = new Map();
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._mainInterval = setInterval(() => this._tick(), 60 * 1000);
        console.log('[AutoBroadcaster] نظام المذيع الآلي بدأ بنجاح');
    }

    stop() {
        if (this._mainInterval) clearInterval(this._mainInterval);
        this.running = false;
    }

    async _tick() {
        const rawDb = database.db;
        try {
            const guildsWithBroadcast = rawDb.prepare(
                "SELECT guild_id, broadcast_channel, broadcast_interval, broadcast_messages, broadcast_mention_role FROM guild_settings WHERE broadcast_enabled = 1 AND broadcast_channel IS NOT NULL AND broadcast_channel != ''"
            ).all();
            for (const row of guildsWithBroadcast) {
                await this._processGuild(row);
            }
        } catch (e) {
            console.error('[AutoBroadcaster] Error in tick:', e.message);
        }
    }

    async _processGuild(row) {
        const { guild_id, broadcast_channel, broadcast_interval, broadcast_messages, broadcast_mention_role } = row;
        let msgs = [];
        try { msgs = JSON.parse(broadcast_messages || '[]'); } catch(e) {}
        if (msgs.length === 0) return;

        const intervalMs = (broadcast_interval || 60) * 60 * 1000;
        const now = Date.now();
        const lastSent = this.lastSent.get(guild_id) || 0;
        if (now - lastSent < intervalMs) return;

        try {
            const channel = this.client.channels.cache.get(broadcast_channel)
                || await this.client.channels.fetch(broadcast_channel).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
            const embed = new EmbedBuilder()
                .setColor('#9333ea')
                .setDescription(randomMsg)
                .setTimestamp()
                .setFooter({ text: 'ZENO BOT - Auto Broadcaster' });

            const mentionContent = broadcast_mention_role ? '<@&' + broadcast_mention_role + '>' : undefined;
            await channel.send({ content: mentionContent, embeds: [embed] });
            this.lastSent.set(guild_id, now);
            console.log('[AutoBroadcaster] Sent broadcast for guild:', guild_id);
        } catch (e) {
            console.error('[AutoBroadcaster] Failed for guild ' + guild_id + ':', e.message);
        }
    }
}

module.exports = AutoBroadcaster;
