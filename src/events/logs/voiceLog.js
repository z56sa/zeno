const { sendServerLog } = require('../../utils/serverLogger');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member || member.user?.bot) return;
    const user = member.user;

    // دخول روم صوتي
    if (!oldState.channelId && newState.channelId) {
      await sendServerLog(guild, 'vc_join', 'voice', {
        title: '⬇️ دخول روم صوتي',
        desc: `**${user.tag}** انضم لقناة صوتية`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🎙️ القناة', value: `<#${newState.channelId}>`, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
      return;
    }

    // خروج من روم صوتي
    if (oldState.channelId && !newState.channelId) {
      await sendServerLog(guild, 'vc_leave', 'voice', {
        title: '⬆️ خروج من روم صوتي',
        desc: `**${user.tag}** غادر القناة الصوتية`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🎙️ القناة', value: `<#${oldState.channelId}>`, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
      return;
    }

    // نقل بين الرومات
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      await sendServerLog(guild, 'vc_switch', 'voice', {
        title: '🔀 نقل بين الرومات',
        desc: `**${user.tag}** انتقل بين قنوات صوتية`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🎙️ من', value: `<#${oldState.channelId}>`, inline: true },
          { name: '🎙️ إلى', value: `<#${newState.channelId}>`, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    // كتم عضو (Server Mute)
    if (!oldState.serverMute && newState.serverMute) {
      await sendServerLog(guild, 'vc_mute_server', 'voice', {
        title: '⬆️ كتم عضو',
        desc: `تم كتم **${user.tag}** في الصوتي`,
        fields: [{ name: '👤 العضو', value: `<@${user.id}>`, inline: true }],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
    if (oldState.serverMute && !newState.serverMute) {
      await sendServerLog(guild, 'vc_unmute_server', 'voice', {
        title: '🔓 إلغاء كتم عضو',
        desc: `تم إلغاء كتم **${user.tag}**`,
        fields: [{ name: '👤 العضو', value: `<@${user.id}>`, inline: true }],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    // إصمات عضو (Server Deaf)
    if (!oldState.serverDeaf && newState.serverDeaf) {
      await sendServerLog(guild, 'vc_deafen_server', 'voice', {
        title: '🔒 إصمات عضو',
        desc: `تم إصمات **${user.tag}**`,
        fields: [{ name: '👤 العضو', value: `<@${user.id}>`, inline: true }],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
    if (oldState.serverDeaf && !newState.serverDeaf) {
      await sendServerLog(guild, 'vc_undeafen_server', 'voice', {
        title: '🔓 إلغاء إصمات',
        desc: `تم إلغاء إصمات **${user.tag}**`,
        fields: [{ name: '👤 العضو', value: `<@${user.id}>`, inline: true }],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    // بث (Streaming)
    if (!oldState.streaming && newState.streaming) {
      await sendServerLog(guild, 'vc_stream_start', 'voice', {
        title: '🖼️ بدء بث',
        desc: `**${user.tag}** بدأ بثاً مباشراً`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🎙️ القناة', value: newState.channelId ? `<#${newState.channelId}>` : 'غير معروف', inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
    if (oldState.streaming && !newState.streaming) {
      await sendServerLog(guild, 'vc_stream_stop', 'voice', {
        title: '🖼️ إنهاء بث',
        desc: `**${user.tag}** أنهى البث المباشر`,
        fields: [{ name: '👤 العضو', value: `<@${user.id}>`, inline: true }],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
  }
};
