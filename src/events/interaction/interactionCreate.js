const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
        const rrData = db.getReactionRole(interaction.customId);
        if (rrData) {
          const role = interaction.guild.roles.cache.get(rrData.role_id);
          if (!role) {
            return interaction.reply({ content: '❌ لم يتم العثور على الرتبة المحددة.', ephemeral: true });
          }

          if (interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.remove(role);
            return interaction.reply({ content: `✅ تمت إزالة رتبة **${role.name}** منك.`, ephemeral: true });
          } else {
            await interaction.member.roles.add(role);
            return interaction.reply({ content: `✅ تم إعطاؤك رتبة **${role.name}** بنجاح.`, ephemeral: true });
          }
        }
      }

      // 2.4 نظام التحقق الأمني (Verification Button & Captcha)
      if (interaction.isButton() && interaction.customId === 'btn_start_verification') {
        const settings = db.getGuildSettings(interaction.guild.id);
        if (!settings.verification_enabled || !settings.verification_role) {
          return interaction.reply({ content: '❌ نظام التحقق غير مفعل في هذا السيرفر.', ephemeral: true });
        }
        const verifiedRole = interaction.guild.roles.cache.get(settings.verification_role);
        if (!verifiedRole) {
          return interaction.reply({ content: '❌ رتبة التحقق غير موجودة. يرجى إبلاغ الإدارة.', ephemeral: true });
        }
        if (interaction.member.roles.cache.has(verifiedRole.id)) {
          return interaction.reply({ content: '✅ أنت موثق مسبقاً ولديك الوصول الكامل للسيرفر!', ephemeral: true });
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
                      { name: '🔒 النوع', value: 'زر فوري', inline: true },
                      { name: '📅 عمر الحساب', value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => { });
              }
            }

            return interaction.reply({
              content: `✅ **تم التحقق بنجاح!** مرحباً بك يا ${interaction.member} في **${interaction.guild.name}**!\nأصبح بإمكانك الوصول إلى جميع القنوات والتحدث مع الأعضاء. استمتع! 🎉`,
              ephemeral: true
            });
          } catch (err) {
            logger.error('فشل في إعطاء رتبة التحقق:', err);
            return interaction.reply({ content: '❌ حدث خطأ أثناء إعطاء رتبة التحقق. تواصل مع الإدارة.', ephemeral: true });
          }
        }
      }

      // معالجة إجابة الكابتشا الحسابية والنصية (Captcha & Code Modal Submit)
      if (interaction.isModalSubmit() && (interaction.customId.startsWith('captcha_verify_') || interaction.customId.startsWith('code_verify_'))) {
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

              return interaction.reply({
                content: `✅ **إجابة صحيحة!** تم التحقق من هويتك بنجاح يا ${interaction.member}!\nأصبح بإمكانك الوصول الكامل لجميع قنوات السيرفر. 🎉`,
                ephemeral: true
              });
            } catch {
              return interaction.reply({ content: '❌ حدث خطأ أثناء إعطاء الرتبة. تواصل مع الإدارة.', ephemeral: true });
            }
          }
        } else {
          return interaction.reply({
            content: `❌ **إجابة خاطئة!** يرجى الضغط على زر التحقق مجدداً والمحاولة مرة أخرى.`,
            ephemeral: true
          });
        }
      }

      // 2.5 التعامل مع زر الاشتراك في القيف أواي (Giveaways Pro)
      if (interaction.isButton() && interaction.customId === 'join_giveaway') {
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway || giveaway.ended) {
          return interaction.reply({ content: '❌ هذا القيف أواي قد انتهى بالفعل!', ephemeral: true });
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
          return interaction.reply({ content: '👋 **تم إلغاء اشتراكك** من هذا السحب.', ephemeral: true });
        } else {
          if (giveaway.required_role && !interaction.member.roles.cache.has(giveaway.required_role)) {
            return interaction.reply({
              content: `❌ **عذراً، لا تستوفي شرط الرتبة!**\nتحتاج إلى رتبة <@&${giveaway.required_role}> للاشتراك في هذا السحب.`,
              ephemeral: true
            });
          }

          if (giveaway.min_account_age > 0) {
            const ageDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (ageDays < giveaway.min_account_age) {
              return interaction.reply({
                content: `❌ **عمر حسابك غير كافٍ!**\nيجب أن يكون عمر حسابك **${giveaway.min_account_age} يوم** على الأقل (عمر حسابك الحالي: ${Math.floor(ageDays)} يوم).`,
                ephemeral: true
              });
            }
          }

          if (giveaway.min_level > 0) {
            const userDb = db.getUser(interaction.user.id, interaction.guild.id);
            if ((userDb.level || 0) < giveaway.min_level) {
              return interaction.reply({
                content: `❌ **مستواك الحالي غير كافٍ!**\nتحتاج إلى المستوى **${giveaway.min_level}** للاشتراك (مستواك الحالي: Level ${userDb.level || 0}).`,
                ephemeral: true
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

          return interaction.reply({
            content: `🎉 **تم تسجيل اشتراكك بنجاح في السحب!** 🍀${hasBonus ? '\n🔥 **ميزة:** لديك فرصة فوز مضاعفة (x2) بفضل رتبتك المميزة!' : ''}`,
            ephemeral: true
          });
        }
      }

      // 2.6 استعراض المشتركين في القيف أواي
      if (interaction.isButton() && interaction.customId === 'view_giveaway_entries') {
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway) {
          return interaction.reply({ content: '❌ لم يتم العثور على القيف أواي.', ephemeral: true });
        }
        const entries = db.getGiveawayEntries(interaction.message.id);
        if (entries.length === 0) {
          return interaction.reply({ content: '👥 لا يوجد أي مشتركين في هذا السحب حتى الآن.', ephemeral: true });
        }

        const topEntries = entries.slice(0, 30).map((id, i) => `${i + 1}. <@${id}>`).join('\n');
        const countText = entries.length > 30 ? `\n... و ${entries.length - 30} مشترك آخرين.` : '';

        return interaction.reply({
          content: `📊 **إجمالي المشتركين في السحب (${entries.length} مشترك):**\n\n${topEntries}${countText}`,
          ephemeral: true
        });
      }

      // 3. التعامل مع أزرار وقوائم التذاكر المخصصة (Custom Tickets) - [تم إصلاح مشكلة التأخير هنا]
      const isTicketButton = interaction.isButton() && (interaction.customId === 'open_ticket' || interaction.customId.startsWith('ticket_open_'));
      const isTicketSelect = interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_');

      if (isTicketButton || isTicketSelect) {
        // الاستجابة الفورية لمنع خطأ انتهاء المهلة (3 ثواني)
        await interaction.deferReply({ ephemeral: true });

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
        const ticketData = db.getTicket(interaction.channel.id);
        if (!ticketData) {
          return interaction.reply({ content: '❌ هذه القناة ليست تذكرة مسجلة.', ephemeral: true });
        }

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_close_ticket')
            .setLabel('تأكيد الإغلاق وحفظ السجل')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_close_ticket')
            .setLabel('إلغاء')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: '⚠️ هل أنت متأكد من رغبتك في إغلاق وحذف هذه التذكرة؟ (سيتم حفظ نسخة Transcript تلقائياً)',
          components: [confirmRow]
        });
      }

      // 5. تأكيد إغلاق وحذف التذكرة وحفظ السجل (Transcript)
      if (interaction.isButton() && interaction.customId === 'confirm_close_ticket') {
        const ticketData = db.getTicket(interaction.channel.id);
        const settings = db.getGuildSettings(interaction.guild.id);

        db.closeTicket(interaction.channel.id);
        await interaction.reply({ content: '🔒 جاري حفظ المحادثة وسيتم حذف التذكرة خلال 5 ثوانٍ...' });

        try {
          const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
          if (messages && settings.log_channel) {
            const logChannel = interaction.guild.channels.cache.get(settings.log_channel);
            if (logChannel) {
              const formattedMessages = Array.from(messages.values())
                .reverse()
                .map(m => `[${new Date(m.createdTimestamp).toLocaleTimeString()}] ${m.author.tag}: ${m.content || (m.attachments.size > 0 ? '[مرفق/ملف]' : '[Embed]')}`)
                .join('\n');

              const { AttachmentBuilder } = require('discord.js');
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
        const settings = db.getGuildSettings(interaction.guild.id);
        if (!settings.verify_role) {
          return interaction.reply({ content: '❌ لم يتم تحديد رتبة التوثيق في لوحة التحكم بعد.', ephemeral: true });
        }

        const role = interaction.guild.roles.cache.get(settings.verify_role);
        if (!role) {
          return interaction.reply({ content: '❌ الرتبة المحددة غير موجودة بالسيرفر.', ephemeral: true });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.reply({ content: '✅ حسابك موثق بالفعل وتمتلك الرتبة مسبقاً!', ephemeral: true });
        }

        try {
          await interaction.member.roles.add(role);
          return interaction.reply({ content: `🎉 تم توثيق حسابك بنجاح! تم منحك رتبة **@${role.name}** وفتح قنوات السيرفر.`, ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: '❌ حدث خطأ أثناء محاولة منحك الرتبة. تأكد من أن رتبة البوت أعلى من رتبة التوثيق.', ephemeral: true });
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

        return interaction.reply({ content: '🌟 تم إرسال تقييمك بنجاح للإدارة! شكراً جزيلاً لوقتك وملاحظاتك.', ephemeral: true });
      }
    } catch (err) {
      logger.error('خطأ في interactionCreate:', err);
    }
  }
};