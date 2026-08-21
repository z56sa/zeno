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
        const categoryId = settings.temp_voice_category || newState.channel?.parentId;
        const tempVoiceChannel = await guild.channels.create({
          name: `🔊 | ${member.user.username}`,
          type: ChannelType.GuildVoice,
          parent: categoryId || null,
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

        if (db.createTempVoice) {
          db.createTempVoice(tempVoiceChannel.id, guild.id, member.id);
        }

        // نقل العضو فوراً إلى الروم الصوتي الجديد
        await member.voice.setChannel(tempVoiceChannel).catch(err => {
          console.error('فشل في نقل العضو للروم المؤقت (تأكد من صلاحية Move Members للبوت):', err);
        });
      } catch (err) {
        console.error('فشل في إنشاء الروم الصوتي المؤقت:', err);
      }
    }

    // حذف الروم المؤقت تلقائياً عند خروج الجميع منه
    if (oldState.channelId && oldState.channelId !== settings.temp_voice_channel) {
      const isTemp = db.isTempVoice ? db.isTempVoice(oldState.channelId) : false;
      if (isTemp) {
        const channel = guild.channels.cache.get(oldState.channelId) || await guild.channels.fetch(oldState.channelId).catch(() => null);
        if (channel && channel.members.size === 0) {
          try {
            if (db.deleteTempVoice) db.deleteTempVoice(oldState.channelId);
            await channel.delete().catch(() => {});
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
