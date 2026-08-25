const { sendServerLog } = require('../../utils/serverLogger');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const guild = member.guild;
    const user = member.user;
    await sendServerLog(guild, 'member_join', 'members', {
      title: '📥 عضو جديد انضم',
      desc: `**${user.tag}** انضم للسيرفر`,
      fields: [
        { name: '👤 العضو', value: `<@${user.id}> (${user.tag})`, inline: true },
        { name: '🆔 الأيدي', value: user.id, inline: true },
        { name: '📅 تاريخ إنشاء الحساب', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '👥 إجمالي الأعضاء', value: `${guild.memberCount}`, inline: false }
      ],
      thumbnail: user.displayAvatarURL({ dynamic: true })
    });
  }
};
