const { sendServerLog } = require('../../utils/serverLogger');
const { AuditLogEvent } = require('discord.js');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const guild = member.guild;
    const user = member.user;

    let eventId = 'member_leave';
    let title = '📤 خروج عضو';
    let desc = `**${user.tag}** غادر السيرفر`;
    let executor = null;

    try {
      await new Promise(r => setTimeout(r, 500));
      const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
      const kickEntry = auditLogs.entries.first();
      if (kickEntry && kickEntry.target?.id === user.id && (Date.now() - kickEntry.createdTimestamp) < 5000) {
        eventId = 'member_kick';
        title = '👢 طرد عضو';
        desc = `**${user.tag}** تم طرده من السيرفر`;
        executor = kickEntry.executor;
      }
    } catch (e) {}

    await sendServerLog(guild, eventId, 'members', {
      title,
      desc,
      fields: [
        { name: '👤 العضو', value: `${user.tag}`, inline: true },
        { name: '🆔 الأيدي', value: user.id, inline: true },
        { name: '👮 المنفذ', value: executor ? `<@${executor.id}>` : 'N/A', inline: true },
        { name: '👥 إجمالي الأعضاء', value: `${guild.memberCount}`, inline: false }
      ],
      thumbnail: user.displayAvatarURL({ dynamic: true })
    });
  }
};
