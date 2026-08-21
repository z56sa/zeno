const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');

// دالة مساعدة لضمان جلب بيانات المستخدم
const fetchUserData = (userId, guildId) => {
  const user = db.getUser(userId, guildId) || {};
  return {
    ...user,
    coins: Number(user.coins ?? user.credits ?? 0),
    credits: Number(user.coins ?? user.credits ?? 0),
    wallpaper_url: user.wallpaper || null
  };
};

module.exports = {
  name: 'star',
  description: 'عرض الرصيد وبطاقة البروفايل أو تحويل عملة STAR COIN ⭐ بأسلوب ProBot',
  aliases: ['c', 'stars', 'credits', 'credit', 'coin', 'coins', 'bal', 'balance', 'starcoin', 'ستار', 'رصيد', 'فلوس', 'كريدت'],
  data: new SlashCommandBuilder()
    .setName('star')
    .setDescription('عرض الرصيد أو تحويل عملة STAR COIN ⭐')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('العضو المراد معرفة رصيده أو التحويل إليه (اختياري)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('المبلغ المراد تحويله (اختياري)')
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction) {
    // تم وضع deferReply في أول سطر لتجنب مشكلة انتهاء مهلة ديسكورد (Unknown interaction)
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const guildId = interaction.guild.id;

    // 1. حالة التحويل إذا تم إدخال العضو والمبلغ
    if (targetUser && amount) {
      const sender = interaction.user;

      if (targetUser.id === sender.id) {
        return interaction.editReply({ content: '❌ | لا يمكنك تحويل العملات لنفسك!' });
      }
      if (targetUser.bot) {
        return interaction.editReply({ content: '❌ | لا يمكنك تحويل العملات للبوتات!' });
      }

      const senderData = fetchUserData(sender.id, guildId);
      const senderBalance = Number(senderData.credits || 0);

      if (senderBalance < amount) {
        return interaction.editReply({
          content: `:warning: | **${sender.username}**, رصيدك غير كافي! رصيدك الحالي هو **${senderBalance.toLocaleString()}** ⭐ Star Coin.`
        });
      }

      const tax = Math.floor(amount * 0.05); // ضريبة 5% مثل بروبوت
      const finalAmount = amount - tax;

      const confirmBtn = new ButtonBuilder()
        .setCustomId('confirm_pay')
        .setLabel(`تأكيد التحويل (${finalAmount.toLocaleString()} ⭐)`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const cancelBtn = new ButtonBuilder()
        .setCustomId('cancel_pay')
        .setLabel('إلغاء')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌');

      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

      const replyMessage = await interaction.editReply({
        content: `🤔 | **${sender.username}**, هل أنت متأكد من رغبتك في تحويل **${amount.toLocaleString()}** ⭐ Star Coin إلى <@${targetUser.id}>؟\n*(الضريبة: ${tax.toLocaleString()} ⭐ - سيستلم العضو: ${finalAmount.toLocaleString()} ⭐)*`,
        components: [row]
      });

      const collector = replyMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000,
        filter: i => i.user.id === sender.id
      });

      collector.on('collect', async i => {
        if (i.customId === 'confirm_pay') {
          const curSender = fetchUserData(sender.id, guildId);
          if (Number(curSender.credits || 0) < amount) {
            return i.update({ content: '❌ | حدث خطأ! رصيدك لم يعد كافياً.', components: [] });
          }

          if (typeof db.addCredits === 'function') {
            db.addCredits(sender.id, guildId, -amount);
            db.addCredits(targetUser.id, guildId, finalAmount);
          }

          await i.update({
            content: `🏧 | **${sender.username}**, تم تحويل **${finalAmount.toLocaleString()}** ⭐ Star Coin إلى <@${targetUser.id}> بنجاح! :money_with_wings:`,
            components: []
          });
        } else {
          await i.update({ content: '❌ | تم إلغاء عملية التحويل.', components: [] });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          await interaction.editReply({ content: '⏱️ | انتهت مهلة تأكيد التحويل وتم إلغاء العملية.', components: [] }).catch(() => { });
        }
      });
      return;
    }

    // 2. حالة الاستعلام عن الرصيد وبطاقة البروفايل
    const userToQuery = targetUser || interaction.user;
    const userData = fetchUserData(userToQuery.id, guildId);

    if (typeof db.getWallpaper === 'function') {
      userData.wallpaper_url = db.getWallpaper(userToQuery.id) || userData.wallpaper_url;
    }

    const balance = Number(userData.credits || 0);
    const formattedBal = balance >= 999999999999999 ? '∞ (غير محدود)' : balance.toLocaleString();

    const member = await interaction.guild.members.fetch(userToQuery.id).catch(() => null);
    let files = [];
    if (member) {
      const rankData = (typeof db.getUserRank === 'function' ? db.getUserRank(userToQuery.id, guildId) : null) || { xp: 0, level: 0, rank: 1 };
      const cardBuffer = await canvasUtil.createProfileCard(member, userData, rankData).catch(() => null);
      if (cardBuffer) {
        files = [new AttachmentBuilder(cardBuffer, { name: 'profile.png' })];
      }
    }

    const replyContent = userToQuery.id === interaction.user.id
      ? `💳 | **${interaction.user.username}**, رصيد حسابك الحالي هو : **${formattedBal}** ⭐ **Star Coin**`
      : `💳 | رصيد حساب **${userToQuery.username}** هو : **${formattedBal}** ⭐ **Star Coin**`;

    await interaction.editReply({
      content: replyContent,
      files: files
    });
  },

  async executePrefix(message, args) {
    const guildId = message.guild.id;
    const sender = message.author;

    let recipient = message.mentions.users.first();
    let amount = null;

    if (args.length >= 2) {
      for (const arg of args) {
        const num = parseInt(arg);
        if (!isNaN(num) && num > 0) {
          amount = num;
          break;
        }
      }
      if (!recipient && args[0] && !isNaN(parseInt(args[0]))) {
        recipient = message.mentions.users.first() || await message.client.users.fetch(args[1]).catch(() => null);
      } else if (!recipient && args[0]) {
        recipient = await message.client.users.fetch(args[0]).catch(() => null);
      }
    }

    if (recipient && amount) {
      if (recipient.id === sender.id) {
        return message.reply({ content: '❌ | لا يمكنك تحويل العملات لنفسك!' });
      }
      if (recipient.bot) {
        return message.reply({ content: '❌ | لا يمكنك تحويل العملات للبوتات!' });
      }

      const senderData = fetchUserData(sender.id, guildId);
      const senderBalance = Number(senderData.credits || 0);

      if (senderBalance < amount) {
        return message.reply({
          content: `:warning: | **${sender.username}**, رصيدك غير كافي! رصيدك الحالي هو **${senderBalance.toLocaleString()}** ⭐ Star Coin.`
        });
      }

      const tax = Math.floor(amount * 0.05);
      const finalAmount = amount - tax;

      const confirmBtn = new ButtonBuilder()
        .setCustomId('confirm_pay_msg')
        .setLabel(`تأكيد التحويل (${finalAmount.toLocaleString()} ⭐)`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const cancelBtn = new ButtonBuilder()
        .setCustomId('cancel_pay_msg')
        .setLabel('إلغاء')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌');

      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

      const promptMsg = await message.reply({
        content: `🤔 | **${sender.username}**, هل أنت متأكد من رغبتك في تحويل **${amount.toLocaleString()}** ⭐ Star Coin إلى <@${recipient.id}>؟\n*(الضريبة: ${tax.toLocaleString()} ⭐ - سيستلم العضو: ${finalAmount.toLocaleString()} ⭐)*`,
        components: [row]
      });

      const collector = promptMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000,
        filter: i => i.user.id === sender.id
      });

      collector.on('collect', async i => {
        if (i.customId === 'confirm_pay_msg') {
          const curSender = fetchUserData(sender.id, guildId);
          if (Number(curSender.credits || 0) < amount) {
            return i.update({ content: '❌ | حدث خطأ! رصيدك لم يعد كافياً لإتمام العملية.', components: [] });
          }

          if (typeof db.addCredits === 'function') {
            db.addCredits(sender.id, guildId, -amount);
            db.addCredits(recipient.id, guildId, finalAmount);
          }

          await i.update({
            content: `🏧 | **${sender.username}**, قام بتحويل **${finalAmount.toLocaleString()}** ⭐ Star Coin إلى <@${recipient.id}> بنجاح! :money_with_wings:`,
            components: []
          });
        } else {
          await i.update({ content: '❌ | تم إلغاء عملية التحويل.', components: [] });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          await promptMsg.edit({ content: '⏱️ | انتهت مهلة تأكيد التحويل وتم إلغاء العملية.', components: [] }).catch(() => { });
        }
      });
      return;
    }

    const userToQuery = message.mentions.users.first() ||
      (args[0] && !parseInt(args[0]) ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
      sender;

    const userData = fetchUserData(userToQuery.id, guildId);
    if (typeof db.getWallpaper === 'function') {
      userData.wallpaper_url = db.getWallpaper(userToQuery.id) || userData.wallpaper_url;
    }

    const balance = Number(userData.credits || 0);
    const formattedBal = balance >= 999999999999999 ? '∞ (غير محدود)' : balance.toLocaleString();

    const member = await message.guild.members.fetch(userToQuery.id).catch(() => null);
    let files = [];
    if (member) {
      const rankData = (typeof db.getUserRank === 'function' ? db.getUserRank(userToQuery.id, guildId) : null) || { xp: 0, level: 0, rank: 1 };
      const cardBuffer = await canvasUtil.createProfileCard(member, userData, rankData).catch(() => null);
      if (cardBuffer) {
        files = [new AttachmentBuilder(cardBuffer, { name: 'profile.png' })];
      }
    }

    const replyContent = userToQuery.id === sender.id
      ? `💳 | **${sender.username}**, رصيد حسابك الحالي هو : **${formattedBal}** ⭐ **Star Coin**`
      : `💳 | رصيد حساب **${userToQuery.username}** هو : **${formattedBal}** ⭐ **Star Coin**`;

    await message.reply({
      content: replyContent,
      files: files
    });
  }
};