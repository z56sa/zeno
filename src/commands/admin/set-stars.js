const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');

const INFINITY_COINS = 999999999999999;

module.exports = {
  name: 'set-stars',
  description: 'تعيين رصيد ستار لعضو أو تفعيل رصيد لا نهائي ⭐ (للإدارة فقط)',
  aliases: ['setstars', 'setstar', 'setcoins', 'setmoney', 'stars-set'],
  data: new SlashCommandBuilder()
    .setName('set-stars')
    .setDescription('تعيين رصيد Star Coin لعضو أو منحه رصيداً لَا نِهَائِيّاً ⭐')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('العضو المراد تعديل رصيده')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('amount')
        .setDescription('المبلغ المطلوب أو اكتب "infinite" للرصيد اللانهائي')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة فقط!', flags: 64 });
    }

    const targetUser = interaction.options.getUser('user');
    const amountInput = interaction.options.getString('amount').trim().toLowerCase();

    let amount = 0;
    let isInfinite = false;

    if (['infinite', 'infinity', 'inf', 'لانهاية', 'لانهائي', 'لا نهائي', 'ما لا نهاية'].includes(amountInput)) {
      amount = INFINITY_COINS;
      isInfinite = true;
    } else {
      amount = parseInt(amountInput);
      if (isNaN(amount) || amount < 0) {
        return interaction.reply({ content: '❌ يرجى إدخال رقم صحيح أو كتابة `infinite` لرصيد لانهائي!', flags: 64 });
      }
    }

    db.setCoins(targetUser.id, interaction.guild.id, amount);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('⭐ تم تعديل رصيد Star Coin بنجاح!')
      .setDescription(
        `تم تعيين رصيد <@${targetUser.id}> إلى: **${isInfinite ? '∞ (لَا نِهَائِيّ)' : amount.toLocaleString() + ' ⭐ Star Coin'}**`
      )
      .addFields(
        { name: '👤 العضو', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
        { name: '🛡️ المشرف', value: `${interaction.user.username}`, inline: true },
        { name: '💳 الرصيد الجديد', value: isInfinite ? '`∞ لا نهائي`' : `\`${amount.toLocaleString()}\` ⭐`, inline: true }
      )
      .setFooter({ text: 'ZENO Economy System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر مخصص للإدارة فقط!');
    }

    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);

    if (!targetUser) {
      return message.reply('❌ الاستخدام: `#set-stars @user infinite` أو `#set-stars @user 50000`');
    }

    const input = (args[1] || '').trim().toLowerCase();
    let amount = 0;
    let isInfinite = false;

    if (['infinite', 'infinity', 'inf', 'لانهاية', 'لانهائي', 'لا نهائي'].includes(input) || (args.length === 1 && ['infinite', 'infinity', 'inf', 'لانهائي'].includes(args[0]))) {
      amount = INFINITY_COINS;
      isInfinite = true;
    } else {
      amount = parseInt(input);
      if (isNaN(amount) || amount < 0) {
        return message.reply('❌ يرجى تحديد المبلغ أو كتابة `infinite` مثل: `#set-stars @user infinite`');
      }
    }

    db.setCoins(targetUser.id, message.guild.id, amount);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('⭐ تم تعديل رصيد Star Coin بنجاح!')
      .setDescription(
        `تم تعيين رصيد <@${targetUser.id}> إلى: **${isInfinite ? '∞ (لَا نِهَائِيّ)' : amount.toLocaleString() + ' ⭐ Star Coin'}**`
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
