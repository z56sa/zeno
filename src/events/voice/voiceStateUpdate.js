const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const guild = newState.guild || oldState.guild;
    const settings = db.getGuildSettings(guild.id);

    // ==========================================
    // 1. نظام الرومات الصوتية المؤقتة (Temp Voice)
    // ==========================================
    if (settings.temp_voice_channel && newState.channelId === settings.temp_voice_channel) {
      try {
        const parentCategory = newState.channel?.parent;
        const tempVoiceChannel = await guild.channels.create({
          name: `🔊 | ${member.user.username}`,
          type: ChannelType.GuildVoice,
          parent: parentCategory || null,
          permissionOverwrites: [
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak
              ]
            }
          ]
        });

        db.createTempVoice(tempVoiceChannel.id, guild.id, member.id);
        await member.voice.setChannel(tempVoiceChannel);
      } catch (err) {
        console.error('فشل في إنشاء الروم الصوتي المؤقت:', err);
      }
    }

    // حذف الروم المؤقت تلقائياً عند خروج الجميع منه
    if (oldState.channelId && oldState.channelId !== settings.temp_voice_channel) {
      const isTemp = db.isTempVoice(oldState.channelId);
      if (isTemp) {
        const channel = guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
          try {
            db.deleteTempVoice(oldState.channelId);
            await channel.delete();
          } catch (err) {
            console.error('فشل في حذف الروم المؤقت:', err);
          }
        }
      }
    }

    // ==========================================
    // 2. سجلات الرومات الصوتية (Voice Logs)
    // ==========================================
    if (!settings.log_channel) return;
    const logChannel = guild.channels.cache.get(settings.log_channel);
    if (!logChannel) return;

    let embed = null;

    // دخول روم صوتي
    if (!oldState.channelId && newState.channelId) {
      embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔊 دخول روم صوتي')
        .setDescription(`قام **${member.user.tag}** (<@${member.id}>) بالدخول إلى الروم الصوتي <#${newState.channelId}>`)
        .setTimestamp();
    }
    // مغادرة روم صوتي
    else if (oldState.channelId && !newState.channelId) {
      embed = new EmbedBuilder()
        .setColor(config.colors.danger)
        .setTitle('🔇 مغادرة روم صوتي')
        .setDescription(`قام **${member.user.tag}** (<@${member.id}>) بمغادرة الروم الصوتي <#${oldState.channelId}>`)
        .setTimestamp();
    }
    // الانتقال بين الرومات الصوتية
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('🔄 انتقال بين الرومات الصوتية')
        .setDescription(`انتقل **${member.user.tag}** (<@${member.id}>) من <#${oldState.channelId}> إلى <#${newState.channelId}>`)
        .setTimestamp();
    }

    if (embed) {
      logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
