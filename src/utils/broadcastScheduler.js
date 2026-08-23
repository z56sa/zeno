// ========================================================
// FILE: src/utils/broadcastScheduler.js
// مجدول الإعلانات والمذيع الآلي المتقدم (Advanced Multi-Channel Broadcast & Scheduler)
// ========================================================
const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const logger = require('./logger');
const config = require('../config.json');

function startBroadcastScheduler(client) {
  logger.info('بدء خدمة الإعلانات والمذيع الآلي المجدول (Advanced Broadcast Scheduler)...');

  setInterval(async () => {
    try {
      const activeBroadcasts = db.getAllActiveBroadcasts();
      const now = Date.now();

      for (const b of activeBroadcasts) {
        const guild = client.guilds.cache.get(b.guild_id);
        if (!guild) continue;

        // حالة 1: إعلان مجدول لمرة واحدة في وقت محدد (One-time Scheduled)
        if (b.scheduled_time && b.scheduled_time > 0 && !b.is_recurring) {
          if (now >= b.scheduled_time) {
            await sendBroadcastPayload(guild, b);
            db.updateBroadcastLastSent(b.id, now);
            db.updateBroadcastStatus(b.id, 'completed');
          }
          continue;
        }

        // حالة 2: إعلان دوري متكرر (Recurring Auto-Broadcast)
        if (b.interval_minutes && b.interval_minutes > 0) {
          const intervalMs = b.interval_minutes * 60 * 1000;
          const lastSent = b.last_sent || 0;

          if (now - lastSent >= intervalMs) {
            await sendBroadcastPayload(guild, b);
            db.updateBroadcastLastSent(b.id, now);
          }
        }
      }
    } catch (err) {
      logger.error(`خطأ في مجدول الإعلانات: ${err.message}`);
    }
  }, 20000); // فحص دوري كل 20 ثانية
}

async function sendBroadcastPayload(guild, broadcast) {
  const channelIds = (broadcast.channel_ids || '').split(',').map(id => id.trim()).filter(Boolean);
  if (channelIds.length === 0) return;

  const embed = new EmbedBuilder()
    .setColor(broadcast.color || config.colors.primary || '#9333ea')
    .setFooter({ text: `${guild.name} • الإعلانات والمذيع الآلي`, iconURL: guild.iconURL({ dynamic: true }) || undefined })
    .setTimestamp();

  if (broadcast.title) embed.setTitle(broadcast.title);
  if (broadcast.image_url) embed.setImage(broadcast.image_url);

  let formattedMessage = broadcast.message
    .replace(/\\n/g, '\n')
    .replace(/\[server\]/gi, guild.name)
    .replace(/\[members\]/gi, guild.memberCount.toString());

  embed.setDescription(formattedMessage);

  for (const cid of channelIds) {
    try {
      const channel = guild.channels.cache.get(cid) || await guild.channels.fetch(cid).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      logger.error(`فشل إرسال الإعلان للقناة ${cid}: ${err.message}`);
    }
  }
}

module.exports = { startBroadcastScheduler, sendBroadcastPayload };
