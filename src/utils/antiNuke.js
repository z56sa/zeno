const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const config = require('../config.json');
const logger = require('./logger');

// تخزين محاولات الإجراءات الإدارية لكل مشرف: guildId -> { modId -> { channels: [], roles: [], bans: [], kicks: [] } }
const actionTracking = new Map();

const antiNuke = {
  /**
   * فحص وتنفيذ إجراء الحماية عند تجاوز الحد المسموح
   */
  async checkAction(guild, actionType, logType) {
    const settings = db.getGuildSettings(guild.id);
    if (!settings.antinuke_enabled) return;

    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: logType
      }).catch(() => null);

      if (!fetchedLogs) return;
      const logEntry = fetchedLogs.entries.first();
      if (!logEntry) return;

      const executor = logEntry.executor;
      if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

      // فحص القائمة البيضاء (Whitelist & Anti Mod)
      if (db.isUserWhitelisted && db.isUserWhitelisted(guild.id, executor.id, 'whitelist')) {
        return; // مستثنى من الحماية
      }
      if (settings.antinuke_whitelist_role) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (member && member.roles.cache.has(settings.antinuke_whitelist_role)) {
          return; // مستثنى من الحماية
        }
      }

      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      if (!actionTracking.has(guild.id)) {
        actionTracking.set(guild.id, new Map());
      }
      const guildActions = actionTracking.get(guild.id);

      if (!guildActions.has(executor.id)) {
        guildActions.set(executor.id, {
          channelDelete: [],
          channelCreate: [],
          roleDelete: [],
          roleCreate: [],
          banAdd: [],
          memberKick: []
        });
      }
      const userRecord = guildActions.get(executor.id);

      // تنظيف السجلات القديمة التي مضى عليها أكثر من دقيقة
      userRecord[actionType] = (userRecord[actionType] || []).filter(t => t > oneMinuteAgo);
      userRecord[actionType].push(now);

      let limit = 3;
      let actionLabel = 'إجراء إداري مشبوه';

      if (actionType === 'channelDelete') {
        limit = settings.antinuke_channel_limit || 3;
        actionLabel = 'حذف متكرر للرومات والقنوات';
      } else if (actionType === 'channelCreate') {
        limit = settings.antinuke_channel_limit || 3;
        actionLabel = 'إنشاء قنوات مكثف بشكل مريب (Spam Channels)';
      } else if (actionType === 'roleDelete') {
        limit = settings.antinuke_role_limit || 3;
        actionLabel = 'حذف متكرر للرتب';
      } else if (actionType === 'roleCreate') {
        limit = settings.antinuke_role_limit || 3;
        actionLabel = 'إنشاء رتب مكثف بشكل مريب (Spam Roles)';
      } else if (actionType === 'banAdd') {
        limit = settings.antinuke_ban_limit || 3;
        actionLabel = 'حظر جماعي للأعضاء (Mass Ban)';
      } else if (actionType === 'memberKick') {
        limit = settings.antinuke_kick_limit || 3;
        actionLabel = 'طرد متكرر للأعضاء (Mass Kick)';
      }

      if (userRecord[actionType].length >= limit) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (!member || !member.manageable) return;

        const punishment = settings.antinuke_punishment || 'strip_roles';
        let punishmentLabel = 'سحب كافة الصلاحيات والرتب الإدارية';

        // 1. سحب الرتب الخطيرة دائماً
        const dangerousRoles = member.roles.cache.filter(r =>
          r.permissions.has(PermissionFlagsBits.Administrator) ||
          r.permissions.has(PermissionFlagsBits.ManageGuild) ||
          r.permissions.has(PermissionFlagsBits.ManageChannels) ||
          r.permissions.has(PermissionFlagsBits.ManageRoles) ||
          r.permissions.has(PermissionFlagsBits.BanMembers) ||
          r.permissions.has(PermissionFlagsBits.KickMembers)
        );

        for (const [_, role] of dangerousRoles) {
          await member.roles.remove(role).catch(() => {});
        }

        // 2. تطبيق العقوبة الإضافية المختارة
        if (punishment === 'ban') {
          await member.ban({ reason: `[Anti-Nuke] تجاوز الحد الأقصى لـ ${actionLabel}` }).catch(() => {});
          punishmentLabel = 'حظر نهائي من السيرفر (Ban) + سحب الرتب';
        } else if (punishment === 'kick') {
          await member.kick(`[Anti-Nuke] تجاوز الحد الأقصى لـ ${actionLabel}`).catch(() => {});
          punishmentLabel = 'طرد فوري من السيرفر (Kick) + سحب الرتب';
        } else if (punishment === 'timeout') {
          await member.timeout(24 * 60 * 60 * 1000, `[Anti-Nuke] تجاوز الحد الأقصى لـ ${actionLabel}`).catch(() => {});
          punishmentLabel = 'عزل وتسكيت لمدة 24 ساعة (Timeout) + سحب الرتب';
        }

        logger.warn(`[ANTI-NUKE] تم تطبيق عقوبة (${punishmentLabel}) على المشرف ${executor.tag} في سيرفر ${guild.name} بسبب ${actionLabel}!`);

        // تسجيل في سجلات الأمان (Security Logs)
        if (db.logSecurityEvent) {
          db.logSecurityEvent(guild.id, 'security', 'auto_punish', executor.id, null, actionLabel, punishmentLabel);
        }

        // 3. إرسال تنبيه في قناة الطوارئ أو اللوق
        const alertChannelId = settings.antinuke_alert_channel || settings.log_channel;
        if (alertChannelId) {
          const alertChannel = guild.channels.cache.get(alertChannelId);
          if (alertChannel) {
            const alertEmbed = new EmbedBuilder()
              .setColor('#FF0033')
              .setTitle('🚨 إحباط محاولة تخريب أمني (Anti-Nuke Action)')
              .setDescription(`🛡️ تم رصد محاولة تخريب وتم إحباطها بنجاح بواسطة نظام الحماية الذكي.`)
              .addFields(
                { name: '👤 المشرف الفاعل', value: `<@${executor.id}> (\`${executor.tag}\`)`, inline: true },
                { name: '⚠️ نوع المخالفة', value: `\`${actionLabel}\``, inline: true },
                { name: '📊 التكرار المسجل', value: `\`${userRecord[actionType].length}/${limit}\` خلال 60 ثانية`, inline: true },
                { name: '⚖️ الإجراء والعقوبة المطبقة', value: `**${punishmentLabel}**`, inline: false }
              )
              .setThumbnail(executor.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: 'نظام الحماية المتقدم • Anti-Nuke Shield' })
              .setTimestamp();

            await alertChannel.send({ embeds: [alertEmbed] }).catch(() => {});
          }
        }

        // 4. إشعار مباشر للأونر على الخاص
        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
          owner.send(`🚨 **تحذير أمني عاجل في سيرفرك: ${guild.name}**\nقام المشرف <@${executor.id}> (\`${executor.tag}\`) بـ **${actionLabel}** وتجاوز الحد المسموح.\n🛡️ **العقوبة المنفذة فوراً:** ${punishmentLabel}`).catch(() => {});
        }

        // تصفير السجل بعد العقوبة
        userRecord[actionType] = [];
      }
    } catch (err) {
      logger.error('خطأ في معالجة Anti-Nuke:', err);
    }
  }
};

module.exports = antiNuke;
