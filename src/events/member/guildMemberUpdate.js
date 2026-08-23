const { EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const guild = newMember.guild;
    const settings = db.getGuildSettings(guild.id);

    if (!settings || settings.boost_enabled === 0) return;

    // التحقق هل العضو قام بعمل بوست جديد
    const oldBoost = oldMember.premiumSince;
    const newBoost = newMember.premiumSince;

    // إذا أصبح يمتلك بوست بعد أن لم يكن يمتلكه
    if (!oldBoost && newBoost) {
      const user = newMember.user;
      const totalBoosts = guild.premiumSubscriptionCount || 1;

      // دالة استبدال المتغيرات
      const formatText = (text) => {
        if (!text) return '';
        return text
          .replace(/\[user\]|\{user\}/gi, `<@${user.id}>`)
          .replace(/\[globalName\]|\{globalName\}/gi, user.globalName || user.username)
          .replace(/\[displayName\]|\{displayName\}/gi, newMember.displayName || user.username)
          .replace(/\[userName\]|\{userName\}/gi, user.username)
          .replace(/\[totalBoosts\]|\{totalBoosts\}/gi, totalBoosts.toString())
          .replace(/\[serverName\]|\{serverName\}/gi, guild.name)
          .replace(/\[server\]|\{server\}/gi, guild.name);
      };

      // 1. إرسال الرسالة في روم البوست المحدد
      if (settings.boost_channel) {
        const channel = guild.channels.cache.get(settings.boost_channel);
        if (channel) {
          const rawMessage = settings.boost_message || '🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts]!';
          const formattedMessage = formatText(rawMessage);

          if (settings.boost_embed_enabled) {
            const embed = new EmbedBuilder()
              .setColor('#f47fff') // Nitro Pink
              .setTitle('🚀 دفعة بوست جديدة!')
              .setDescription(formattedMessage)
              .setThumbnail(user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: '✨ الداعم', value: `<@${user.id}>`, inline: true },
                { name: '💎 إجمالي البوستات', value: `${totalBoosts}`, inline: true }
              )
              .setTimestamp();

            await channel.send({ content: `<@${user.id}>`, embeds: [embed] }).catch(() => {});
          } else {
            await channel.send({ content: formattedMessage }).catch(() => {});
          }
        }
      }

      // 2. إرسال رسالة شكر في الخاص إذا كانت مفعلة
      if (settings.boost_dm_enabled) {
        try {
          const dmRaw = settings.boost_dm_message || 'شكراً جزيلاً لدعمك سيرفر [serverName] بالبوست! 🚀';
          const dmFormatted = formatText(dmRaw);
          await newMember.send(dmFormatted).catch(() => {});
        } catch (e) {
          // خاص مغلق
        }
      }
    }
  }
};
