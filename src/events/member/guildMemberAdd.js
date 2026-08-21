const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');
const config = require('../../config.json');

// مخزن مؤقت لكشف الريد (Raid Detection Map)
const raidMap = new Map(); // guildId => [timestamps]

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id);

    // 0. فحوصات الأمان (Security Checks)
    // --- 0.1 Anti-Bot: طرد البوتات التلقائية ---
    if (settings.anti_bot && member.user.bot) {
      try {
        await member.kick('Anti-Bot Protection: بوتات غير مصرح بها ممنوعة');
        if (settings.log_channel) {
          const logCh = guild.channels.cache.get(settings.log_channel);
          if (logCh) {
            logCh.send({
              embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🤖 Anti-Bot | تم طرد بوت غير مصرح')
                .setDescription(`تم طرد البوت **${member.user.tag}** (${member.id}) تلقائياً بسبب تفعيل حماية Anti-Bot.`)
                .setTimestamp()
              ]
            }).catch(() => {});
          }
        }
        return;
      } catch (err) {
        console.error('فشل طرد البوت (Anti-Bot):', err);
      }
    }

    // --- 0.2 Anti-Alt: طرد الحسابات الجديدة (Alt Accounts) ---
    if (settings.anti_alt_days && settings.anti_alt_days > 0) {
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < settings.anti_alt_days) {
        try {
          const dmMsg = `⚠️ **تم طرد حسابك من سيرفر ${guild.name}**\n`
            + `سبب الطرد: حسابك عمره **${Math.floor(accountAgeDays)} يوم** وهو أقل من الحد المسموح (**${settings.anti_alt_days} يوم**).\n`
            + `يرجى الانضمام مجدداً بعد مرور **${Math.ceil(settings.anti_alt_days - accountAgeDays)} يوم** من الآن.`;
          await member.send(dmMsg).catch(() => {});
          await member.kick(`Anti-Alt Protection: حساب عمره ${Math.floor(accountAgeDays)} يوم أقل من ${settings.anti_alt_days} يوم`);
          if (settings.log_channel) {
            const logCh = guild.channels.cache.get(settings.log_channel);
            if (logCh) {
              logCh.send({
                embeds: [new EmbedBuilder()
                  .setColor('#FF6600')
                  .setTitle('🔞 Anti-Alt | تم طرد حساب Alt')
                  .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                  .addFields(
                    { name: '👤 العضو', value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: '📅 عمر الحساب', value: `${Math.floor(accountAgeDays)} يوم`, inline: true },
                    { name: '🛡️ الحد المحدد', value: `${settings.anti_alt_days} يوم`, inline: true }
                  )
                  .setTimestamp()
                ]
              }).catch(() => {});
            }
          }
          return;
        } catch (err) {
          console.error('فشل طرد الحساب Alt (Anti-Alt):', err);
        }
      }
    }

    // --- 0.3 Anti-Raid: كشف الريد (5 أعضاء في 10 ثواني) ---
    if (settings.anti_raid) {
      const now = Date.now();
      const guildJoins = raidMap.get(guild.id) || [];
      const recentJoins = guildJoins.filter(t => now - t < 10000); // آخر 10 ثواني
      recentJoins.push(now);
      raidMap.set(guild.id, recentJoins);

      if (recentJoins.length >= 5) {
        // كشف ريد! أرسل تنبيه للوق وعطّل الانضمام بكيك العضو
        try {
          await member.kick('Anti-Raid Protection: تم اكتشاف هجوم ريد');
          if (settings.log_channel) {
            const logCh = guild.channels.cache.get(settings.log_channel);
            if (logCh) {
              logCh.send({
                embeds: [new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('🚨 تحذير RAID | هجوم مكتشف!')
                  .setDescription(`⚠️ **تم اكتشاف هجوم Raid!**\nانضم **${recentJoins.length} عضو** في أقل من 10 ثواني!\nتم طرد العضو الأخير: **${member.user.tag}** تلقائياً.`)
                  .addFields(
                    { name: '📊 معدل الانضمام', value: `${recentJoins.length} عضو / 10 ثواني`, inline: true },
                    { name: '🛡️ الإجراء', value: 'طرد تلقائي للأعضاء الجدد', inline: true }
                  )
                  .setTimestamp()
                ]
              }).catch(() => {});
            }
          }
          return;
        } catch (err) {
          console.error('فشل طرد عضو في الريد (Anti-Raid):', err);
        }
      }
    }

    // 1. نظام الرتب التلقائية (Auto-Role)
    const autoRoleId = settings.auto_role || settings.autorole_id;
    if (autoRoleId) {
      try {
        const role = guild.roles.cache.get(autoRoleId);
        if (role) {
          await member.roles.add(role);
        }
      } catch (err) {
        console.error('فشل في إعطاء الرتبة التلقائية:', err);
      }
    }

    // 2. نظام الترحيب (Welcome Message & Canvas Card)
    if (settings.welcome_channel) {
      const welcomeChannel = guild.channels.cache.get(settings.welcome_channel);
      if (welcomeChannel) {
        let msg = settings.welcome_message || 'أهلاً بك يا [user] في سيرفر **[server]**! 🎉 أنت العضو رقم [memberCount]';
        msg = msg
          .replace(/\[user\]/gi, `<@${member.id}>`)
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\[userName\]/gi, member.user.username)
          .replace(/\{userName\}/gi, member.user.username)
          .replace(/\[server\]/gi, guild.name)
          .replace(/\{server\}/gi, guild.name)
          .replace(/\[memberCount\]/gi, guild.memberCount.toString())
          .replace(/\{memberCount\}/gi, guild.memberCount.toString());

        const sendPayload = { content: msg };

        if (settings.welcome_image) {
          try {
            const cardBuffer = await canvasUtil.createWelcomeCard(member);
            const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
            sendPayload.files = [attachment];
          } catch (err) {
            console.error('فشل إنشاء بطاقة الترحيب:', err);
          }
        }

        welcomeChannel.send(sendPayload).catch(() => {});
      }
    }

    // 3. سجل انضمام الأعضاء (Join Log)
    if (settings.log_channel) {
      const logChannel = guild.channels.cache.get(settings.log_channel);
      if (logChannel) {
        const joinEmbed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('📥 عضو جديد انضم إلى السيرفر')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 العضو', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: '🆔 الأيدي', value: `${member.id}`, inline: true },
            { name: '📅 تاريخ إنشاء الحساب', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: false },
            { name: '👥 إجمالي الأعضاء', value: `${guild.memberCount}`, inline: true }
          )
          .setTimestamp();

        logChannel.send({ embeds: [joinEmbed] }).catch(() => {});
      }
    }
  }
};
