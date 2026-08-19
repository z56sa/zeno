const { PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const embedUtil = require('../../utils/embed');
const config = require('../../config.json');

// مخزن مؤقت لكشف السبام (Spam Protection)
const spamMap = new Map();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const settings = db.getGuildSettings(guildId);

    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

    const isAutoModWhitelisted = isAdmin ||
      (settings.automod_whitelist_role && message.member?.roles.cache.has(settings.automod_whitelist_role)) ||
      (settings.automod_whitelist_channel && message.channel.id === settings.automod_whitelist_channel);

    // ==========================================
    // 🛡️ درع الرقابة التلقائية المتقدم (Auto-Mod)
    // ==========================================

    if (!isAutoModWhitelisted) {
      // 1. فلتر الكلمات المحظورة والشتم (Blacklist Words Filter)
      if (settings.bad_words_enabled && settings.bad_words_list) {
        const rawList = settings.bad_words_list.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        const lowerMsg = message.content.toLowerCase();
        const foundBadWord = rawList.find(word => lowerMsg.includes(word));

        if (foundBadWord) {
          try {
            await message.delete().catch(() => {});

            // تطبيق الإجراء المحدد
            const action = settings.automod_action || 'warn';
            let actionText = 'تحذير';

            if (action === 'timeout_5m') {
              await message.member?.timeout(5 * 60 * 1000, 'Auto-Mod: استخدام كلمات محظورة').catch(() => {});
              actionText = 'عزل مؤقت (5 دقائق)';
            } else if (action === 'timeout_1h') {
              await message.member?.timeout(60 * 60 * 1000, 'Auto-Mod: استخدام كلمات محظورة').catch(() => {});
              actionText = 'عزل مؤقت (ساعة)';
            } else if (action === 'kick') {
              await message.member?.kick('Auto-Mod: استخدام كلمات محظورة').catch(() => {});
              actionText = 'طرد من السيرفر';
            }

            const alert = await message.channel.send({
              content: `⚠️ **الرقابة التلقائية | Auto-Mod:** يا ${message.author}، تم حذف رسالتك لاحتوائها على كلمات غير مسموح بها! (${actionText})`
            });
            setTimeout(() => alert.delete().catch(() => {}), 5000);

            // إرسال تقرير اللوق
            if (settings.log_channel) {
              const logCh = message.guild.channels.cache.get(settings.log_channel);
              if (logCh) {
                logCh.send({
                  embeds: [new (require('discord.js').EmbedBuilder)()
                    .setColor('#E74C3C')
                    .setTitle('🛡️ Auto-Mod | رصد كلمة محظورة')
                    .addFields(
                      { name: '👤 العضو', value: `${message.author.tag} (${message.author.id})`, inline: true },
                      { name: '💬 الروم', value: `<#${message.channel.id}>`, inline: true },
                      { name: '⚖️ الإجراء المتخذ', value: actionText, inline: true },
                      { name: '📄 نص الرسالة', value: `\`\`\`${message.content.substring(0, 1000)}\`\`\``, inline: false }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => {});
              }
            }
            return;
          } catch (err) {
            console.error('فشل في معالجة الكلمات المحظورة:', err);
          }
        }
      }

      // 2. منع المنشن الجماعي (Anti-Mass-Mention)
      if (settings.anti_mass_mention) {
        const mentionLimit = settings.max_mentions || 4;
        const totalMentions = message.mentions.users.size + message.mentions.roles.size;
        if (totalMentions >= mentionLimit) {
          try {
            await message.delete().catch(() => {});
            await message.member?.timeout(5 * 60 * 1000, 'Auto-Mod: منشن جماعي مفرط').catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** تم حذف رسالة ${message.author} وعزله 5 دقائق لتجاوز حد المنشن المسموح (${totalMentions}/${mentionLimit})!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 6000);
            return;
          } catch (err) {
            console.error('فشل معالجة المنشن الجماعي:', err);
          }
        }
      }

      // 3. منع الحروف الكبيرة الصارخة (Anti-Caps)
      if (settings.anti_caps && message.content.length >= 8) {
        const letters = message.content.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= 6) {
          const upperCount = letters.replace(/[^A-Z]/g, '').length;
          const capsRatio = upperCount / letters.length;
          if (capsRatio > 0.7) {
            try {
              await message.delete().catch(() => {});
              const warn = await message.channel.send({
                content: `⚠️ **Auto-Mod:** يا ${message.author}، يرجى عدم الكتابة بالحروف الكبيرة (Caps Lock) بشكل مفرط!`
              });
              setTimeout(() => warn.delete().catch(() => {}), 4000);
              return;
            } catch (err) {}
          }
        }
      }

      // 4. منع سبام الإيموجيات (Anti-Emoji-Spam)
      if (settings.anti_emoji_spam) {
        const maxEmojis = settings.max_emojis || 5;
        const customEmojis = (message.content.match(/<a?:.+?:\d+>/g) || []).length;
        const unicodeEmojis = (message.content.match(/\p{Extended_Pictographic}/gu) || []).length;
        const totalEmojis = customEmojis + unicodeEmojis;

        if (totalEmojis > maxEmojis) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، تم حذف رسالتك لتجاوز حد الإيموجيات المسموح (${totalEmojis}/${maxEmojis})!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }

      // 5. منع تكرار الأسطر الفارغة والنصوص الطويلة (Anti-Line-Spam)
      if (settings.anti_line_spam) {
        const maxLines = settings.max_lines || 8;
        const linesCount = message.content.split('\n').length;
        if (linesCount > maxLines) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، يرجى عدم النزول بأسطر متعددة في رسالة واحدة!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }
    }

    // --- 1. نظام الحماية من الروابط (Anti-Link) ---
    if (settings.anti_link && !isAutoModWhitelisted) {
      const linkRegex = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li)\/[^\s]+)|(discord\.com\/invite\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|xyz|gg|tk|ml|ga|cf|gq)\b)/gi;
      if (linkRegex.test(message.content)) {
        try {
          await message.delete();
          const warnMsg = await message.channel.send({
            content: `🚫 **تم حذف الرابط تلقائياً!** يمنع نشر الروابط في السيرفر يا ${message.author}!`
          });
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
          return;
        } catch (err) {
          console.error('فشل حذف الرابط (تأكد من صلاحيات البوت Manage Messages):', err);
        }
      }
    }

    // --- 1.5 نظام الحماية من دعوات الديسكورد (Anti-Invites) ---
    if (settings.anti_invites && !isAutoModWhitelisted) {
      const inviteRegex = /discord\.(gg|io|me|li|com\/invite)\/[^\s]+/gi;
      if (inviteRegex.test(message.content)) {
        try {
          await message.delete();
          const warnMsg = await message.channel.send({
            content: `🔗 **تم حذف الدعوة!** ممنوع نشر دعوات السيرفرات الأخرى يا ${message.author}!`
          });
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
          return;
        } catch (err) {
          console.error('فشل حذف دعوة الديسكورد:', err);
        }
      }
    }

    // --- 1.6 تتبع الرسائل لكشف الغوست بينج (Anti-Ghost-Ping Tracker) ---
    if (settings.anti_ghost_ping && message.mentions.users.size > 0 && !message.author.bot) {
      // حفظ معرفات المذكورين مؤقتاً في الرسالة (سيتم الكشف في messageDelete)
      message.mentionedUserIds = [...message.mentions.users.keys()];
    }

    // --- 2. نظام الحماية من السبام (Anti-Spam) ---
    if (settings.anti_spam) {
      const now = Date.now();
      const userSpam = spamMap.get(userId) || { count: 0, lastMessage: now, messages: [] };

      if (now - userSpam.lastMessage < 2500) {
        userSpam.count += 1;
        userSpam.messages.push(message);
      } else {
        userSpam.count = 1;
        userSpam.messages = [message];
      }
      userSpam.lastMessage = now;
      spamMap.set(userId, userSpam);

      if (userSpam.count >= 4) {
        try {
          // حذف رسائل السبام السريعة
          for (const msg of userSpam.messages) {
            await msg.delete().catch(() => {});
          }
          await message.member?.timeout(60 * 1000, 'Anti-Spam Protection').catch(() => {});
          const spamWarn = await message.channel.send({
            content: `⚠️ تم إسكات ${message.author} لمدة دقيقة وحذف الرسائل المتكررة (Anti-Spam).`
          });
          setTimeout(() => spamWarn.delete().catch(() => {}), 6000);
          spamMap.delete(userId);
          return;
        } catch (err) {
          console.error('فشل في معالجة السبام:', err);
        }
      }
    }

    // --- 3. نظام نقاط الخبرة والمستويات (XP & Leveling) ---
    if (settings.leveling_enabled !== 0) {
      const userDb = db.getUser(userId, guildId);
      const now = Date.now();
      if (now - userDb.last_message_xp >= config.economy.xpCooldownMs) {
        const baseXP = Math.floor(Math.random() * 10) + config.economy.xpPerMessage;
        const multiplier = settings.level_multiplier || 1;
        const xpGained = baseXP * multiplier;

        const { level, leveledUp } = db.addXp(userId, guildId, xpGained);

        if (leveledUp) {
          // فحص مكافآت الرتب للمستوى الجديد وإعطاؤها للعضو
          const rewards = db.getLevelRewards(guildId).filter(r => r.level <= level);
          for (const rew of rewards) {
            const roleObj = message.guild.roles.cache.get(rew.role_id);
            if (roleObj && !message.member.roles.cache.has(roleObj.id)) {
              await message.member.roles.add(roleObj).catch(() => {});
            }
          }

          // تجهيز رسالة رفع المستوى
          const rawMsg = settings.level_message || '🎉 مبروك يا {user}! لقد ارتفع مستواك إلى **المستوى {level}**! 🚀';
          const formattedMsg = rawMsg
            .replace(/{user}/g, `${message.author}`)
            .replace(/{level}/g, `${level}`)
            .replace(/{server}/g, `${message.guild.name}`);

          const channelMode = settings.level_channel || 'current';
          if (channelMode === 'disabled') {
            // معطلة بدون إرسال رسالة
          } else if (channelMode === 'dm') {
            message.author.send(formattedMsg).catch(() => {});
          } else if (channelMode === 'current') {
            const lvlMsg = await message.channel.send(formattedMsg).catch(() => {});
            if (lvlMsg) setTimeout(() => lvlMsg.delete().catch(() => {}), 8000);
          } else {
            // روم مخصص
            const targetChan = message.guild.channels.cache.get(channelMode);
            if (targetChan) targetChan.send(formattedMsg).catch(() => {});
          }
        }
      }
    }

    // --- 4. نظام الرد التلقائي (Auto Responder) ---
    const autoResponders = db.getAutoResponders(guildId);
    if (autoResponders && autoResponders.length > 0) {
      const lowerContent = message.content.toLowerCase().trim();
      const match = autoResponders.find(r => lowerContent === r.trigger_word || lowerContent.includes(r.trigger_word));
      if (match) {
        message.reply({ content: match.reply_text }).catch(() => {});
      }
    }

    // --- 5. معالجة الأوامر بالبرفكس (Prefix Commands) ---
    const prefix = settings.prefix || config.defaultPrefix || '#';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName) ||
                    client.prefixCommands.get(client.aliases.get(commandName));

    if (!command) return;

    try {
      if (command.executePrefix) {
        await command.executePrefix(message, args, client);
      }
    } catch (error) {
      console.error(`خطأ أثناء تنفيذ الأمر البرفكس ${commandName}:`, error);
      message.reply({
        embeds: [embedUtil.error('خطأ', 'حدث خطأ أثناء محاولة تنفيذ هذا الأمر.')]
      }).catch(() => {});
    }
  }
};
