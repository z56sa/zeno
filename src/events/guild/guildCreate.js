const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const db = require('../../database');

module.exports = {
  name: 'guildCreate',
  async execute(guild, client) {
    logger.info(`🎉 تم إضافة البوت إلى سيرفر جديد: ${guild.name} (${guild.id}) - عدد الأعضاء: ${guild.memberCount}`);
    
    // تسجيل إعدادات السيرفر الافتراضية في قاعدة البيانات فوراً
    try {
      db.getGuildSettings(guild.id);
      await guild.members.fetch().catch(() => null);
    } catch (e) {}

    // إرسال إشعار السيرفر الجديد إلى مالك البوت في الخاص (DM)
    try {
      const botClient = client || guild.client;
      if (!botClient) return;

      // 1. تحديد مالك البوت
      let ownerId = process.env.OWNER_ID || process.env.BOT_OWNER_ID;
      if (!ownerId && botClient.application) {
        if (!botClient.application.owner) {
          await botClient.application.fetch().catch(() => null);
        }
        if (botClient.application.owner) {
          ownerId = botClient.application.owner.id || (botClient.application.owner.members ? botClient.application.owner.ownerId : null);
        }
      }

      if (!ownerId) {
        logger.warn('⚠️ تعذر العثور على أيدي مالك البوت لإرسال إشعار السيرفر الجديد.');
        return;
      }

      const botOwner = await botClient.users.fetch(ownerId).catch(() => null);
      if (!botOwner) return;

      // 2. محاولة معرفة من قام بإضافة البوت من الـ Audit Logs
      let addedByUser = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 1
        }).catch(() => null);

        if (auditLogs && auditLogs.entries.size > 0) {
          const entry = auditLogs.entries.first();
          if (entry && entry.target && entry.target.id === botClient.user.id) {
            addedByUser = entry.executor;
          }
        }
      } catch (err) {}

      // 3. جلب مالك السيرفر
      let guildOwner = null;
      try {
        guildOwner = await guild.fetchOwner().catch(() => null);
      } catch (err) {}

      // 4. محاولة إنشاء رابط دعوة للسيرفر
      let inviteUrl = null;
      try {
        const defaultChannel = guild.channels.cache.find(
          c => (c.type === ChannelType.GuildText || c.type === 0) &&
               c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
        ) || guild.channels.cache.find(
          c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
        );

        if (defaultChannel) {
          const invite = await defaultChannel.createInvite({
            maxAge: 0,
            maxUses: 0,
            reason: 'ZENO Bot Owner Server Tracking'
          }).catch(() => null);
          if (invite) {
            inviteUrl = invite.url;
          }
        }
      } catch (err) {}

      // 5. بناء الإمبد بتصميم مطابق للصورة
      const botName = botClient.user.username || 'ZENO';
      const botAvatar = botClient.user.displayAvatarURL({ dynamic: true });
      const guildIcon = guild.iconURL({ dynamic: true, size: 256 }) || botAvatar;

      const embed = new EmbedBuilder()
        .setColor('#22c55e') // اللون الأخضر الفاتح الجانبي المطابق
        .setTitle(`✅ ${botName} joined a new server`)
        .setDescription(`The bot has been added to **${guild.name}**.`)
        .setThumbnail(guildIcon)
        .addFields(
          {
            name: '🏠 Server',
            value: `**${guild.name}**\n\`${guild.id}\``,
            inline: false
          },
          {
            name: '👥 Members',
            value: `${guild.memberCount.toLocaleString()}`,
            inline: false
          },
          {
            name: '👤 Added by',
            value: addedByUser ? `<@${addedByUser.id}>\n${addedByUser.username} (\`${addedByUser.id}\`)` : (guildOwner ? `<@${guildOwner.id}>\n${guildOwner.user.username} (\`${guildOwner.id}\`)` : 'Unknown'),
            inline: false
          },
          {
            name: '👑 Owner',
            value: guildOwner ? `<@${guildOwner.id}>\n${guildOwner.user.username} (\`${guildOwner.id}\`)` : `<@${guild.ownerId}> (\`${guild.ownerId}\`)`,
            inline: false
          },
          {
            name: '🔗 Server link',
            value: inviteUrl ? `[Open invite](${inviteUrl})` : 'No invite available (Missing permissions)',
            inline: false
          }
        )
        .setFooter({
          text: `${botName} • Server tracking`,
          iconURL: botAvatar
        })
        .setTimestamp();

      const components = [];
      if (inviteUrl) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Open server invite')
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl)
            .setEmoji('🔗')
        );
        components.push(row);
      }

      await botOwner.send({
        embeds: [embed],
        components: components
      }).catch(err => {
        logger.warn(`⚠️ تعذر إرسال رسالة خاصة لمالك البوت (${botOwner.tag}): ${err.message}`);
      });

    } catch (e) {
      logger.error(`[guildCreate Notification Error]: ${e.message}`);
    }
  }
};
