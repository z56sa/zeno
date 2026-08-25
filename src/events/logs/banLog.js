const { sendServerLog } = require('../../utils/serverLogger');
const { AuditLogEvent } = require('discord.js');

module.exports = [
  {
    name: 'guildBanAdd',
    async execute(ban) {
      const guild = ban.guild;
      const user = ban.user;
      let executor = null, reason = null;
      try {
        await new Promise(r => setTimeout(r, 500));
        const logs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
        const entry = logs.entries.first();
        if (entry && entry.target?.id === user.id) { executor = entry.executor; reason = entry.reason; }
      } catch (e) {}
      await sendServerLog(guild, 'member_ban', 'members', {
        title: '🪓 حظر عضو',
        desc: `**${user.tag}** تم حظره من السيرفر`,
        fields: [
          { name: '👤 العضو', value: `${user.tag}`, inline: true },
          { name: '🆔 الأيدي', value: user.id, inline: true },
          { name: '👮 المنفذ', value: executor ? `<@${executor.id}>` : 'غير معروف', inline: true },
          { name: '📝 السبب', value: reason || 'لا يوجد سبب', inline: false }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
  },
  {
    name: 'guildBanRemove',
    async execute(ban) {
      const guild = ban.guild;
      const user = ban.user;
      let executor = null;
      try {
        await new Promise(r => setTimeout(r, 500));
        const logs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanRemove });
        const entry = logs.entries.first();
        if (entry && entry.target?.id === user.id) executor = entry.executor;
      } catch (e) {}
      await sendServerLog(guild, 'member_unban', 'members', {
        title: '🔓 فك حظر عضو',
        desc: `**${user.tag}** تم فك حظره`,
        fields: [
          { name: '👤 العضو', value: `${user.tag}`, inline: true },
          { name: '🆔 الأيدي', value: user.id, inline: true },
          { name: '👮 المنفذ', value: executor ? `<@${executor.id}>` : 'غير معروف', inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
  }
];
