const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    if (!member.guild) return;
    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id);

    // 1. فحص الحماية ومكافحة الطرد العشوائي (Anti-Nuke Kick Detection)
    try {
      await antiNuke.checkAction(guild, 'memberKick', AuditLogEvent.MemberKick);
    } catch (e) {}

    // 2. نظام رسائل المغادرة (Leave / Goodbye Message)
    if (settings.leave_enabled && settings.leave_channel) {
      const leaveChannel = guild.channels.cache.get(settings.leave_channel);
      if (leaveChannel) {
        let msg = settings.leave_message || 'وداعاً يا [userName]، نتمنى رؤيتك مجدداً 👋 (أصبح عدد الأعضاء [memberCount])';
        msg = msg
          .replace(/\[user\]/gi, `${member.user.tag}`)
          .replace(/\{user\}/gi, `${member.user.tag}`)
          .replace(/\[userName\]/gi, member.user.username)
          .replace(/\{userName\}/gi, member.user.username)
          .replace(/\[server\]/gi, guild.name)
          .replace(/\{server\}/gi, guild.name)
          .replace(/\[memberCount\]/gi, guild.memberCount.toString())
          .replace(/\{memberCount\}/gi, guild.memberCount.toString());

        const leaveEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setDescription(msg)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `عدد الأعضاء الحالي: ${guild.memberCount}` })
          .setTimestamp();

        leaveChannel.send({ embeds: [leaveEmbed] }).catch(() => {});
      }
    }

    // 3. سجل مغادرة الأعضاء (Leave Log)
    if (settings.log_channel) {
      const logChannel = guild.channels.cache.get(settings.log_channel);
      if (logChannel) {
        const leaveLogEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('📤 عضو غادر السيرفر')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 العضو', value: `${member.user.tag} (${member.id})`, inline: true },
            { name: '🆔 الأيدي', value: `${member.id}`, inline: true },
            { name: '👥 الأعضاء المتبقين', value: `${guild.memberCount}`, inline: true }
          )
          .setTimestamp();

        logChannel.send({ embeds: [leaveLogEmbed] }).catch(() => {});
      }
    }
  }
};
