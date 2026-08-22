const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const db = require('../../database');
const embedUtil = require('../../utils/embed');
const logger = require('../../utils/logger');
const config = require('../../config.json');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // 1. التعامل مع أوامر السلاش (Slash Commands)
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          return interaction.reply({ content: '❌ هذا الأمر غير مسجل حالياً.', ephemeral: true }).catch(() => { });
        }

        try {
          await command.execute(interaction, client);
        } catch (error) {
          logger.error(`خطأ أثناء تنفيذ أمر السلاش ${interaction.commandName}:`, error);
          const errorEmbed = embedUtil.error('حدث خطأ', 'حدث خطأ غير متوقع أثناء محاولة تنفيذ هذا الأمر.');
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => { });
          } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => { });
          }
        }
        return;
      }

      // 2. التعامل مع أزرار الرتب التفاعلية (Reaction Roles)
      if (interaction.isButton() && interaction.customId.startsWith('rr_')) {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const rrData = db.getReactionRole(interaction.customId);
        if (rrData) {
          const role = interaction.guild.roles.cache.get(rrData.role_id);
          if (!role) {
            return interaction.editReply({ content: '❌ لم يتم العثور على الرتبة المحددة.' });
          }

          if (interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.remove(role);
            return interaction.editReply({ content: `✅ تمت إزالة رتبة **${role.name}** منك.` });
          } else {
            await interaction.member.roles.add(role);
            return interaction.editReply({ content: `✅ تم إعطاؤك رتبة **${role.name}** بنجاح.` });
          }
        }
        return;
      }

      // 2.4 نظام التحقق الأمني (Verification Button & Direct Role)
      if (interaction.isButton() && (interaction.customId === 'btn_start_verification' || interaction.customId === 'btn_quick_verify' || interaction.customId === 'verify_button' || interaction.customId === 'verify_member')) {
        const settings = db.getGuildSettings(interaction.guild.id);
        const roleId = settings.verify_role || settings.verification_role;
        if (!roleId) {
          return interaction.reply({ content: '❌ لم يتم تحديد رتبة التفعيل بعد في إعدادات السيرفر.', ephemeral: true });
        }
        const verifiedRole = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!verifiedRole) {
          return interaction.reply({ content: '❌ لم يتم العثور على رتبة التحقق. يرجى مراجعة إعدادات الرتب.', ephemeral: true });
        }
        if (interaction.member.roles.cache.has(verifiedRole.id)) {
          return interaction.reply({ content: '✅ أنت موثق ومفعل مسبقاً ولديك حق الوصول لجميع القنوات!', ephemeral: true });
        }

        // فحص عمر الحساب (Anti-Alt Check)
        if (settings.anti_alt_days && settings.anti_alt_days > 0) {
          const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          if (accountAgeDays < settings.anti_alt_days) {
            return interaction.reply({
              content: `❌ **عذراً، حسابك حديث جداً!**\nيتطلب السيرفر أن يكون عمر الحساب **${settings.anti_alt_days} يوم** على الأقل للتوثيق (عمر حسابك الحالي: ${Math.floor(accountAgeDays)} يوم).`,
              ephemeral: true
            });
          }
        }

        if (settings.verification_type === 'captcha') {
          const num1 = Math.floor(Math.random() * 9) + 1;
          const num2 = Math.floor(Math.random() * 9) + 1;
          const answer = num1 + num2;
          const modal = new ModalBuilder()
            .setCustomId(`captcha_verify_${answer}`)
            .setTitle('🔢 التحقق الأمني - أثبت أنك لست بوت!');
          const captchaInput = new TextInputBuilder()
            .setCustomId('captcha_answer')
            .setLabel(`⚡ احسب: ${num1} + ${num2} = ?`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('أدخل الجواب بالأرقام...')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(3);
          modal.addComponents(new ActionRowBuilder().addComponents(captchaInput));
          return interaction.showModal(modal);
        } else if (settings.verification_type === 'code') {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

          const modal = new ModalBuilder()
            .setCustomId(`code_verify_${code}`)
            .setTitle('🔤 التحقق الأمني - كود التأكيد');
          const codeInput = new TextInputBuilder()
            .setCustomId('code_answer')
            .setLabel(`اكتب هذا الكود بالضبط: [ ${code} ]`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(code)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(5);
          modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
          return interaction.showModal(modal);
        } else {
          await interaction.deferReply({ ephemeral: true }).catch(() => { });
          try {
            await interaction.member.roles.add(verifiedRole);
            if (settings.unverified_role) {
              const unverifiedRole = interaction.guild.roles.cache.get(settings.unverified_role);
              if (unverifiedRole && interaction.member.roles.cache.has(unverifiedRole.id)) {
                await interaction.member.roles.remove(unverifiedRole).catch(() => { });
              }
            }

            if (settings.log_channel) {
              const logCh = interaction.guild.channels.cache.get(settings.log_channel);
              if (logCh) {
                logCh.send({
                  embeds: [new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('✅ توثيق وتفعيل عضو جديد')
                    .addFields(
                      { name: '👤 العضو', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                      { name: '🎖️ الرتبة الممنوحة', value: `${verifiedRole.name}`, inline: true },
                      { name: '📅 تاريخ الإنضمام', value: `<t:${Math.floor(interaction.member.joinedTimestamp / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => { });
              }
            }

            return interaction.editReply({
              content: `🎉 **تم تفعيلك بنجاح!**\nتم منحك رتبة **${verifiedRole.name}** وأصبح بإمكانك الوصول الكامل لجميع قنوات السيرفر. استمتع! 🚀`
            });
          } catch (err) {
            logger.error('فشل في إعطاء رتبة التحقق:', err);
            return interaction.editReply({ content: '❌ حدث خطأ أثناء إعطاء رتبة التحقق. تأكد من أن رتبة البوت أعلى من الرتبة المراد إعطاؤها.' });
          }
        }
      }

      // معالجة إجابة الكابتشا الحسابية والنصية (Captcha & Code Modal Submit)
      if (interaction.isModalSubmit() && (interaction.customId.startsWith('captcha_verify_') || interaction.customId.startsWith('code_verify_'))) {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const isCode = interaction.customId.startsWith('code_verify_');
        const correctVal = interaction.customId.split('_')[2];
        const userVal = isCode
          ? interaction.fields.getTextInputValue('code_answer').trim().toUpperCase()
          : parseInt(interaction.fields.getTextInputValue('captcha_answer'));

        const isMatch = isCode ? (userVal === correctVal) : (userVal === parseInt(correctVal));
        const settings = db.getGuildSettings(interaction.guild.id);

        if (isMatch) {
          const verifiedRole = interaction.guild.roles.cache.get(settings.verification_role);
          if (verifiedRole) {
            try {
              await interaction.member.roles.add(verifiedRole);
              if (settings.unverified_role) {
                const unverifiedRole = interaction.guild.roles.cache.get(settings.unverified_role);
                if (unverifiedRole && interaction.member.roles.cache.has(unverifiedRole.id)) {
                  await interaction.member.roles.remove(unverifiedRole).catch(() => { });
                }
              }

              if (settings.log_channel) {
                const logCh = interaction.guild.channels.cache.get(settings.log_channel);
                if (logCh) {
                  logCh.send({
                    embeds: [new EmbedBuilder()
                      .setColor('#2ECC71')
                      .setTitle('✅ توثيق عضو جديد')
                      .addFields(
                        { name: '👤 العضو', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                        { name: '🔒 النوع', value: isCode ? 'كود نصي' : 'كابتشا حسابية', inline: true },
                        { name: '📅 عمر الحساب', value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`, inline: true }
                      )
                      .setTimestamp()
                    ]
                  }).catch(() => { });
                }
              }

              return interaction.editReply({
                content: `✅ **إجابة صحيحة!** تم التحقق من هويتك بنجاح يا ${interaction.member}!\nأصبح بإمكانك الوصول الكامل لجميع قنوات السيرفر. 🎉`
              });
            } catch {
              return interaction.editReply({ content: '❌ حدث خطأ أثناء إعطاء الرتبة. تواصل مع الإدارة.' });
            }
          }
        } else {
          return interaction.editReply({
            content: `❌ **إجابة خاطئة!** يرجى الضغط على زر التحقق مجدداً والمحاولة مرة أخرى.`
          });
        }
      }

      // 2.5 التعامل مع زر الاشتراك في القيف أواي (Giveaways Pro)
      if (interaction.isButton() && interaction.customId === 'join_giveaway') {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway || giveaway.ended) {
          return interaction.editReply({ content: '❌ هذا القيف أواي قد انتهى بالفعل!' });
        }

        const entries = db.getGiveawayEntries(interaction.message.id);
        const hasJoined = entries.includes(interaction.user.id);

        if (hasJoined) {
          db.removeGiveawayEntry(interaction.message.id, interaction.user.id);
          const newEntries = db.getGiveawayEntries(interaction.message.id);
          const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('join_giveaway')
              .setLabel(`🎉 اشتراك (${newEntries.length})`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('view_giveaway_entries')
              .setLabel('👥 المشتركين')
              .setStyle(ButtonStyle.Secondary)
          );
          await interaction.message.edit({ components: [newRow] }).catch(() => { });
          return interaction.editReply({ content: '👋 **تم إلغاء اشتراكك** من هذا السحب.' });
        } else {
          if (giveaway.required_role && !interaction.member.roles.cache.has(giveaway.required_role)) {
            return interaction.editReply({
              content: `❌ **عذراً، لا تستوفي شرط الرتبة!**\nتحتاج إلى رتبة <@&${giveaway.required_role}> للاشتراك في هذا السحب.`
            });
          }

          if (giveaway.min_account_age > 0) {
            const ageDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (ageDays < giveaway.min_account_age) {
              return interaction.editReply({
                content: `❌ **عمر حسابك غير كافٍ!**\nيجب أن يكون عمر حسابك **${giveaway.min_account_age} يوم** على الأقل (عمر حسابك الحالي: ${Math.floor(ageDays)} يوم).`
              });
            }
          }

          if (giveaway.min_level > 0) {
            const userDb = db.getUser(interaction.user.id, interaction.guild.id);
            if ((userDb.level || 0) < giveaway.min_level) {
              return interaction.editReply({
                content: `❌ **مستواك الحالي غير كافٍ!**\nتحتاج إلى المستوى **${giveaway.min_level}** للاشتراك (مستواك الحالي: Level ${userDb.level || 0}).`
              });
            }
          }

          db.addGiveawayEntry(interaction.message.id, interaction.user.id);
          const newEntries = db.getGiveawayEntries(interaction.message.id);
          const hasBonus = giveaway.extra_role && interaction.member.roles.cache.has(giveaway.extra_role);

          const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('join_giveaway')
              .setLabel(`🎉 اشتراك (${newEntries.length})`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('view_giveaway_entries')
              .setLabel('👥 المشتركين')
              .setStyle(ButtonStyle.Secondary)
          );
          await interaction.message.edit({ components: [newRow] }).catch(() => { });

          return interaction.editReply({
            content: `🎉 **تم تسجيل اشتراكك بنجاح في السحب!** 🍀${hasBonus ? '\n🔥 **ميزة:** لديك فرصة فوز مضاعفة (x2) بفضل رتبتك المميزة!' : ''}`
          });
        }
      }

      // 2.6 استعراض المشتركين في القيف أواي
      if (interaction.isButton() && interaction.customId === 'view_giveaway_entries') {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway) {
          return interaction.editReply({ content: '❌ لم يتم العثور على القيف أواي.' });
        }
        const entries = db.getGiveawayEntries(interaction.message.id);
        if (entries.length === 0) {
          return interaction.editReply({ content: '👥 لا يوجد أي مشتركين في هذا السحب حتى الآن.' });
        }

        const topEntries = entries.slice(0, 30).map((id, i) => `${i + 1}. <@${id}>`).join('\n');
        const countText = entries.length > 30 ? `\n... و ${entries.length - 30} مشترك آخرين.` : '';

        return interaction.editReply({
          content: `📊 **إجمالي المشتركين في السحب (${entries.length} مشترك):**\n\n${topEntries}${countText}`
        });
      }

      // 3. التعامل مع أزرار وقوائم التذاكر المخصصة (Custom Tickets)
      const isTicketButton = interaction.isButton() && (interaction.customId === 'open_ticket' || interaction.customId.startsWith('ticket_open_'));
      const isTicketSelect = interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_');

      if (isTicketButton || isTicketSelect) {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });

        let panelId = null;
        let selectedCategoryType = 'support';
        let categoryLabel = 'الدعم الفني';

        if (interaction.isButton() && interaction.customId.startsWith('ticket_open_')) {
          panelId = interaction.customId.replace('ticket_open_', '');
        } else if (interaction.isStringSelectMenu()) {
          panelId = interaction.customId.replace('ticket_select_', '');
          selectedCategoryType = interaction.values[0];

          const selectedOption = interaction.component?.options?.find(o => o.value === selectedCategoryType);
          if (selectedOption) {
            categoryLabel = (selectedOption.emoji ? selectedOption.emoji.name + ' ' : '') + selectedOption.label;
          } else {
            categoryLabel = selectedCategoryType;
          }
        }

        const panel = panelId ? db.getTicketPanel(panelId) : null;
        const settings = db.getGuildSettings(interaction.guild.id);

        let catConfig = null;
        if (panel?.categories_json) {
          try {
            const parsedCats = JSON.parse(panel.categories_json);
            catConfig = parsedCats[selectedCategoryType];
          } catch { }
        }

        const cleanCategory = selectedCategoryType.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '-').slice(0, 15);
        const existingTicket = interaction.guild.channels.cache.find(
          c => c.name === `ticket-${interaction.user.username.toLowerCase()}` ||
            c.name === `ticket-${cleanCategory}-${interaction.user.username.toLowerCase()}`
        );

        if (existingTicket) {
          return interaction.editReply({
            content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existingTicket.id}>`
          });
        }

        const supportRoleId = catConfig?.role || panel?.support_role || settings.ticket_role;
        const categoryId = catConfig?.category || panel?.category_id || settings.ticket_category;
        const rawNaming = catConfig?.naming || panel?.naming_scheme || 'ticket-{username}';
        const channelName = rawNaming
          .replace(/{username}/g, interaction.user.username.toLowerCase())
          .replace(/{type}/g, cleanCategory)
          .replace(/{id}/g, interaction.user.id.slice(-4));

        const permissionOverwrites = [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ];

        if (supportRoleId) {
          permissionOverwrites.push({
            id: supportRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          });
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId || null,
          permissionOverwrites
        });

        db.createTicket(ticketChannel.id, interaction.guild.id, interaction.user.id, selectedCategoryType);

        let welcomeDescription = catConfig?.welcome || panel?.welcome_msg || 'مرحباً بك {user}!\nيرجى كتابة استفسارك أو مشكلتك بالتفصيل وسيقوم فريق الدعم بالرد عليك قريباً.';
        welcomeDescription = welcomeDescription.replace(/{user}/g, `<@${interaction.user.id}>`);

        const ticketEmbed = new EmbedBuilder()
          .setColor(config.colors.ticket)
          .setTitle(`🎫 ${panel?.title || 'تذكرة الدعم الفني'} | ${categoryLabel}`)
          .setDescription(welcomeDescription)
          .addFields(
            { name: '👤 صاحب التذكرة', value: `<@${interaction.user.id}>`, inline: true },
            { name: '📂 القسم', value: `\`${categoryLabel}\``, inline: true },
            { name: '⏰ تاريخ الفتح', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'لإغلاق التذكرة اضغط على الزر أدناه' });

        const closeBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('إغلاق التذكرة')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          content: `${interaction.user} ${supportRoleId ? `<@&${supportRoleId}>` : ''}`,
          embeds: [ticketEmbed],
          components: [closeBtn]
        });

        return interaction.editReply({
          content: `✅ تم فتح تذكرتك بنجاح في: <#${ticketChannel.id}>`
        });
      }

      // 4. إغلاق التذكرة
      if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_close_ticket')
            .setLabel('تأكيد الإغلاق وحذف التذكرة')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_close_ticket')
            .setLabel('إلغاء')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: '⚠️ هل أنت متأكد من رغبتك في إغلاق وحذف هذه التذكرة؟ (سيتم حفظ نسخة Transcript باللوق تلقائياً)',
          components: [confirmRow],
          ephemeral: true
        });
      }

      // 5. تأكيد إغلاق وحذف التذكرة وحفظ السجل (Transcript)
      if (interaction.isButton() && interaction.customId === 'confirm_close_ticket') {
        await interaction.deferReply().catch(() => { });
        const ticketData = db.getTicket(interaction.channel.id);
        const settings = db.getGuildSettings(interaction.guild.id);

        db.closeTicket(interaction.channel.id);

        // 👮 Staff Activity: تسجيل إغلاق التذكرة للستاف
        if (db.recordStaffAction) {
          db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ticket_close', ticketData ? ticketData.user_id : null, 'إغلاق تذكرة');
        }

        await interaction.editReply({ content: '🔒 جاري حفظ المحادثة وسيتم حذف التذكرة خلال 5 ثوانٍ...' });

        try {
          const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
          if (messages && settings.log_channel) {
            const logChannel = interaction.guild.channels.cache.get(settings.log_channel);
            if (logChannel) {
              const formattedMessages = Array.from(messages.values())
                .reverse()
                .map(m => `[${new Date(m.createdTimestamp).toLocaleTimeString()}] ${m.author.tag}: ${m.content || (m.attachments.size > 0 ? '[مرفق/ملف]' : '[Embed]')}`)
                .join('\n');

              const transcriptFile = new AttachmentBuilder(Buffer.from(formattedMessages, 'utf-8'), {
                name: `transcript-${interaction.channel.name}.txt`
              });

              const closeEmbed = new EmbedBuilder()
                .setColor(config.colors.danger)
                .setTitle('🔒 إغلاق تذكرة وحفظ السجل')
                .addFields(
                  { name: '🎫 اسم الروم', value: `\`${interaction.channel.name}\``, inline: true },
                  { name: '👤 صاحب التذكرة', value: ticketData ? `<@${ticketData.user_id}>` : 'غير معروف', inline: true },
                  { name: '👮 أغلقت بواسطة', value: `${interaction.user.tag}`, inline: true }
                )
                .setTimestamp();

              await logChannel.send({ embeds: [closeEmbed], files: [transcriptFile] }).catch(() => { });
            }
          }
        } catch (err) {
          console.error('فشل في حفظ Transcript:', err);
        }

        if (ticketData) {
          try {
            const ticketOwner = await client.users.fetch(ticketData.user_id).catch(() => null);
            if (ticketOwner) {
              const ratingEmbed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('⭐ تقييم تجربة الدعم الفني')
                .setDescription(`مرحباً **${ticketOwner.username}**!\nتم إغلاق تذكرتك في سيرفر **${interaction.guild.name}**.\n\nيرجى تقييم مستوى الخدمة ومساعدة فريق الدعم بالضغط على التقييم المناسب أدناه:`)
                .setFooter({ text: 'آراؤكم تساعدنا على تقديم الأفضل دائماً!' })
                .setTimestamp();

              const ratingRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rate_ticket_1_${ticketData.channel_id}_${interaction.guild.id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_2_${ticketData.channel_id}_${interaction.guild.id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_3_${ticketData.channel_id}_${interaction.guild.id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_4_${ticketData.channel_id}_${interaction.guild.id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_ticket_5_${ticketData.channel_id}_${interaction.guild.id}`).setLabel('⭐ 5 ممتاز').setStyle(ButtonStyle.Success)
              );

              await ticketOwner.send({ embeds: [ratingEmbed], components: [ratingRow] }).catch(() => { });
            }
          } catch (e) { }
        }

        setTimeout(async () => {
          try {
            db.deleteTicket(interaction.channel.id);
            await interaction.channel.delete();
          } catch (err) {
            logger.error('فشل في حذف روم التذكرة:', err);
          }
        }, 5000);
        return;
      }

      // 6. إلغاء الإغلاق
      if (interaction.isButton() && interaction.customId === 'cancel_close_ticket') {
        return interaction.update({
          content: '✅ تم إلغاء عملية الإغلاق.',
          components: []
        });
      }

      // 7. زر التحقق وتوثيق الحساب (Verification System)
      if (interaction.isButton() && interaction.customId === 'verify_user_btn') {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const settings = db.getGuildSettings(interaction.guild.id);
        if (!settings.verify_role) {
          return interaction.editReply({ content: '❌ لم يتم تحديد رتبة التوثيق في لوحة التحكم بعد.' });
        }

        const role = interaction.guild.roles.cache.get(settings.verify_role);
        if (!role) {
          return interaction.editReply({ content: '❌ الرتبة المحددة غير موجودة بالسيرفر.' });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.editReply({ content: '✅ حسابك موثق بالفعل وتمتلك الرتبة مسبقاً!' });
        }

        try {
          await interaction.member.roles.add(role);
          return interaction.editReply({ content: `🎉 تم توثيق حسابك بنجاح! تم منحك رتبة **@${role.name}** وفتح قنوات السيرفر.` });
        } catch (err) {
          return interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة منحك الرتبة. تأكد من أن رتبة البوت أعلى من رتبة التوثيق.' });
        }
      }

      // 8. الضغط على نجوم التقييم (Ticket Rating Stars Button)
      if (interaction.isButton() && interaction.customId.startsWith('rate_ticket_')) {
        const parts = interaction.customId.split('_');
        const rating = parseInt(parts[2], 10) || 5;
        const ticketId = parts[3] || '0';
        const guildId = parts[4] || interaction.guildId;

        const modal = new ModalBuilder()
          .setCustomId(`modal_review_${rating}_${ticketId}_${guildId}`)
          .setTitle(`⭐ تقييمك: ${rating} من 5 نجوم`);

        const commentInput = new TextInputBuilder()
          .setCustomId('review_comment')
          .setLabel('ملاحظتك أو رأيك في الدعم الفني (اختياري):')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('اكتب أي ملاحظة أو رسالة لفريق الإدارة والدعم الفني...')
          .setRequired(false)
          .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(commentInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      // 9. إرسال نموذج التقييم (Ticket Rating Modal Submit)
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_review_')) {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const parts = interaction.customId.split('_');
        const rating = parseInt(parts[2], 10) || 5;
        const ticketId = parts[3];
        const guildId = parts[4];
        const comment = interaction.fields.getTextInputValue('review_comment') || 'بدون تعليق إضافي';

        db.addTicketRating(guildId, ticketId, interaction.user.id, null, rating, comment);

        const settings = db.getGuildSettings(guildId);
        if (settings && settings.feedback_channel) {
          const targetGuild = client.guilds.cache.get(guildId);
          const feedbackChan = targetGuild?.channels.cache.get(settings.feedback_channel);
          if (feedbackChan) {
            const starsEmoji = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
            const feedbackEmbed = new EmbedBuilder()
              .setColor(rating >= 4 ? config.colors.success : (rating === 3 ? config.colors.warning : config.colors.danger))
              .setTitle('⭐ تقييم جديد لخدمة الدعم الفني')
              .addFields(
                { name: '👤 العضو المقيم', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: '📊 مستوى التقييم', value: `\`${starsEmoji}\` (${rating}/5)`, inline: true },
                { name: '💬 التعليق والملاحظات', value: `\`\`\`${comment}\`\`\`` }
              )
              .setFooter({ text: targetGuild.name, iconURL: targetGuild.iconURL({ dynamic: true }) })
              .setTimestamp();

            await feedbackChan.send({ embeds: [feedbackEmbed] }).catch(() => { });
          }
        }

        return interaction.editReply({ content: '🌟 تم إرسال تقييمك بنجاح للإدارة! شكراً جزيلاً لوقتك وملاحظاتك.' });
      }

      // ==========================================
      // 10. نظام التقديمات (Applications System Handlers)
      // ==========================================
      // فتح نموذج التقديم عبر اختيار من القائمة أو ضغطة زر
      if ((interaction.isStringSelectMenu() && interaction.customId === 'select_apply_form') || (interaction.isButton() && interaction.customId.startsWith('btn_apply_'))) {
        const appId = interaction.isStringSelectMenu() ? interaction.values[0] : interaction.customId.replace('btn_apply_', '');
        const app = db.getApplication(appId);

        if (!app || app.status !== 'open') {
          return interaction.reply({ content: '❌ استمارة التقديم هذه غير متاحة أو تم إغلاقها.', ephemeral: true });
        }

        let questions = [];
        try {
          questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
        } catch (e) {
          questions = ['ما هو سبب تقديمك؟', 'ما هي خبراتك السابقة؟'];
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_submit_app_${app.id}`)
          .setTitle(`📝 ${app.title.slice(0, 40)}`);

        questions.slice(0, 5).forEach((q, idx) => {
          const input = new TextInputBuilder()
            .setCustomId(`q_${idx}`)
            .setLabel(q.slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });

        return interaction.showModal(modal);
      }

      // استلام إجابات التقديم وحفظها وإرسالها للإدارة
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_submit_app_')) {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });
        const appId = interaction.customId.replace('modal_submit_app_', '');
        const app = db.getApplication(appId);

        if (!app) {
          return interaction.editReply({ content: '❌ لم يتم العثور على نموذج التقديم.' });
        }

        let questions = [];
        try {
          questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
        } catch (e) {
          questions = [];
        }

        const answers = [];
        questions.slice(0, 5).forEach((q, idx) => {
          const ans = interaction.fields.getTextInputValue(`q_${idx}`) || 'لا توجد إجابة';
          answers.push({ question: q, answer: ans });
        });

        const submission = db.createSubmission(interaction.guild.id, app.id, interaction.user.id, answers);

        // إرسال الطلب لقناة السجلات / المراجعة
        const logChannelId = app.log_channel || db.getGuildSettings(interaction.guild.id)?.log_channel;
        if (logChannelId) {
          const logChan = interaction.guild.channels.cache.get(logChannelId);
          if (logChan) {
            const reviewEmbed = new EmbedBuilder()
              .setColor(config.colors.primary)
              .setTitle(`📋 طلب تقديم جديد: ${app.title} (#${submission.id})`)
              .setDescription(`👤 **مقدم الطلب:** ${interaction.user} (\`${interaction.user.tag}\`)\n🆔 **الآيدي:** \`${interaction.user.id}\`\n📅 **تاريخ التقديم:** <t:${submission.submitted_at}:F>`)
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: `نموذج #${app.id} • بانتظار قرار الإدارة` })
              .setTimestamp();

            answers.forEach((item, i) => {
              reviewEmbed.addFields({
                name: `❓ ${i + 1}. ${item.question}`,
                value: `\`\`\`${item.answer.slice(0, 1000)}\`\`\``
              });
            });

            const actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_app_accept_${submission.id}`)
                .setLabel('✅ قبول الطلب')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`btn_app_reject_${submission.id}`)
                .setLabel('❌ رفض الطلب')
                .setStyle(ButtonStyle.Danger)
            );

            await logChan.send({ embeds: [reviewEmbed], components: [actionRow] }).catch(() => { });
          }
        }

        return interaction.editReply({
          content: `✅ **تم استلام طلب تقديمك بنجاح!**\nتم إرسال إجاباتك إلى إدارة السيرفر لمراجعتها، وسيتم إشعارك بالنتيجة فور اتخاذ القرار.`
        });
      }

      // قبول طلب التقديم (Accept Application)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_accept_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: '❌ ليس لديك صلاحية لمراجعة وقبول التقديمات.', ephemeral: true });
        }

        await interaction.deferUpdate().catch(() => { });
        const subId = interaction.customId.replace('btn_app_accept_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.followUp({ content: '⚠️ هذا الطلب تمت مراجعته مسبقاً!', ephemeral: true });
        }

        const app = db.getApplication(submission.app_id);
        db.updateSubmissionStatus(subId, 'accepted', interaction.user.id);
        db.addApplicationPoint(interaction.guild.id, interaction.user.id);

        // إعطاء الرتبة للمتقدم إن وجدت
        if (app && app.accepted_role) {
          const role = interaction.guild.roles.cache.get(app.accepted_role);
          const member = interaction.guild.members.cache.get(submission.user_id) || await interaction.guild.members.fetch(submission.user_id).catch(() => null);
          if (role && member) {
            await member.roles.add(role).catch(() => { });
          }
        }

        // إشعار العضو بالخاص
        const applicantUser = client.users.cache.get(submission.user_id) || await client.users.fetch(submission.user_id).catch(() => null);
        if (applicantUser) {
          applicantUser.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.success)
              .setTitle('🎉 تهانينا! تم قبول طلب تقديمك')
              .setDescription(`تمت الموافقة على طلب تقديمك على **${app ? app.title : 'الرتبة'}** في سيرفر **${interaction.guild.name}**.\nنتمنى لك كل التوفيق! 🌟`)
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
              .setTimestamp()
            ]
          }).catch(() => { });
        }

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed)
          .setColor(config.colors.success)
          .setTitle(oldEmbed.title + ' [مقبول ✅]')
          .addFields({ name: '✨ تم القبول بواسطة', value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false });

        return interaction.editReply({ embeds: [updatedEmbed], components: [] });
      }

      // رفض طلب التقديم (Reject Application)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_reject_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: '❌ ليس لديك صلاحية لمراجعة ورفض التقديمات.', ephemeral: true });
        }

        await interaction.deferUpdate().catch(() => { });
        const subId = interaction.customId.replace('btn_app_reject_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.followUp({ content: '⚠️ هذا الطلب تمت مراجعته مسبقاً!', ephemeral: true });
        }

        const app = db.getApplication(submission.app_id);
        db.updateSubmissionStatus(subId, 'rejected', interaction.user.id);
        db.addApplicationPoint(interaction.guild.id, interaction.user.id);

        // إشعار العضو بالخاص
        const applicantUser = client.users.cache.get(submission.user_id) || await client.users.fetch(submission.user_id).catch(() => null);
        if (applicantUser) {
          applicantUser.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ نعتذر منك! لم يتم قبول طلب تقديمك')
              .setDescription(`نأسف لإبلاغك بأنه لم يتم قبول طلب تقديمك على **${app ? app.title : 'الرتبة'}** في سيرفر **${interaction.guild.name}** حالياً.\nشكراً جزيلاً لاهتمامك ووقتك!`)
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
              .setTimestamp()
            ]
          }).catch(() => { });
        }

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed)
          .setColor(config.colors.danger)
          .setTitle(oldEmbed.title + ' [مرفوض ❌]')
          .addFields({ name: '🚫 تم الرفض بواسطة', value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false });

        return interaction.editReply({ embeds: [updatedEmbed], components: [] });
      }
    } catch (err) {
      logger.error('خطأ في interactionCreate:', err);
    }
  }
};