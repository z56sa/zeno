const { EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'presenceUpdate',
  async execute(oldPresence, newPresence, client) {
    try {
      if (!newPresence || !newPresence.guild || !newPresence.userId) return;
      const guild = newPresence.guild;
      const userId = newPresence.userId;

      // فحص هل العضو مسجل في شفت نشط حالياً
      const activeShift = db.getActiveStaffShift(guild.id, userId);
      if (!activeShift) return;

      const settings = db.getGuildSettings(guild.id);
      // التحقق من تفعيل ميزة الخروج التلقائي
      if (settings.staff_auto_logout === 0) return;

      const newStatus = newPresence.status; // 'online', 'idle', 'dnd', 'offline'

      // إذا أصبح غير متصل تماماً أو مخفي (Offline / Invisible)
      if (newStatus === 'offline' || newStatus === 'invisible') {
        const result = db.endStaffShift(guild.id, userId, 'auto_offline');
        if (result && result.success) {
          const durationHours = Math.floor(result.duration / 3600);
          const durationMins = Math.floor((result.duration % 3600) / 60);
          const durationSecs = result.duration % 60;
          const durationStr = `${durationHours > 0 ? `${durationHours} ساعة و ` : ''}${durationMins} دقيقة و ${durationSecs} ثانية`;

          const logChannelId = settings.staff_log_channel || settings.log_channel;
          const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

          if (logChannel && logChannel.isTextBased()) {
            const autoLogoutEmbed = new EmbedBuilder()
              .setColor('#f59e0b')
              .setTitle('⚠️ تسجيل خروج تلقائي (Auto Logout - Offline)')
              .setDescription(`تم تسجيل خروج <@${userId}> تلقائياً لانقطاع الاتصال أو خروجه من ديسكورد، لضمان عدم احتساب ساعات وهمية.`)
              .addFields(
                { name: '👤 الإداري', value: `<@${userId}>`, inline: true },
                { name: '⏱️ مدة التواجد الفعلي', value: `\`${durationStr}\``, inline: true },
                { name: '⭐ النقاط المحتسبة', value: `+${result.pointsEarned} نقطة`, inline: true },
                { name: '📌 السبب', value: 'خروج من الديسكورد (Offline / Invisible)', inline: false }
              )
              .setFooter({ text: 'نظام مراقبة نشاط الإدارة الذكي • ZENO' })
              .setTimestamp();

            await logChannel.send({ embeds: [autoLogoutEmbed] }).catch(() => {});
          }

          // محاولة إرسال تنبيه للعضو في الخاص
          try {
            const memberUser = await client.users.fetch(userId).catch(() => null);
            if (memberUser) {
              await memberUser.send({
                content: `🔔 **تنبيه نظام الإدارة:** لقد قمت بالخروج من الديسكورد أثناء تواجدك في الخدمة بسيرفر **${guild.name}**، وتم تسجيل خروجك تلقائياً واحتساب مدة عملك: **${durationStr}**.`
              }).catch(() => {});
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      // ignore transient presence errors
    }
  }
};
