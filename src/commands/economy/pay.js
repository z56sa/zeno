const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'pay',
  description: 'تحويل عملة STAR COIN ⭐ إلى عضو آخر في السيرفر',
  aliases: ['transfer', 'تحويل', 'ارسال', 'send', 'starsend'],
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('تحويل عملة STAR COIN ⭐ إلى عضو آخر')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('العضو المراد التحويل إليه')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('المبلغ المراد تحويله')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const sender = interaction.user;
    const recipient = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const guildId = interaction.guild.id;

    if (recipient.id === sender.id) {
      return interaction.reply({ content: '❌ لا يمكنك تحويل العملات لنفسك!', ephemeral: true });
    }
    if (recipient.bot) {
      return interaction.reply({ content: '❌ لا يمكنك تحويل العملات للبوتات!', ephemeral: true });
    }

    const senderData = db.getUser(sender.id, guildId);
    const senderBalance = Number(senderData.credits || 0);

    if (senderBalance < amount) {
      return interaction.reply({
        content: `❌ رصيدك غير كافي! رصيدك الحالي هو **${senderBalance.toLocaleString()}** Star Coin ⭐`,
        ephemeral: true
      });
    }

    // خصم من المرسل وإضافة للمستلم
    const senderNew = db.addCredits(sender.id, guildId, -amount);
    const recipientNew = db.addCredits(recipient.id, guildId, amount);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('💸 تمت عملية التحويل بنجاح!')
      .setDescription(
        `📤 **من:** <@${sender.id}>\n` +
        `📥 **إلى:** <@${recipient.id}>\n` +
        `💰 **المبلغ المحول:** \`${amount.toLocaleString()}\` **STAR COIN** ⭐\n\n` +
        `💳 **رصيدك المتبقي:** \`${senderNew.toLocaleString()}\` ⭐`
      )
      .setFooter({ text: 'ZENO Economy System • Star Coin', iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const sender = message.author;
    const guildId = message.guild.id;

    const recipient = message.mentions.users.first() ||
                      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    const amount = parseInt(args[1] || args[0]);

    if (!recipient || !amount || isNaN(amount) || amount <= 0) {
      return message.reply({ content: '⚠️ طريقة الاستخدام الصحيحة:\n`#pay @user <amount>` أو `#تحويل @user 100`' });
    }

    if (recipient.id === sender.id) {
      return message.reply({ content: '❌ لا يمكنك تحويل العملات لنفسك!' });
    }
    if (recipient.bot) {
      return message.reply({ content: '❌ لا يمكنك تحويل العملات للبوتات!' });
    }

    const senderData = db.getUser(sender.id, guildId);
    const senderBalance = Number(senderData.credits || 0);

    if (senderBalance < amount) {
      return message.reply({
        content: `❌ رصيدك غير كافي! رصيدك الحالي هو **${senderBalance.toLocaleString()}** Star Coin ⭐`
      });
    }

    const senderNew = db.addCredits(sender.id, guildId, -amount);
    const recipientNew = db.addCredits(recipient.id, guildId, amount);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('💸 تمت عملية التحويل بنجاح!')
      .setDescription(
        `📤 **من:** <@${sender.id}>\n` +
        `📥 **إلى:** <@${recipient.id}>\n` +
        `💰 **المبلغ المحول:** \`${amount.toLocaleString()}\` **STAR COIN** ⭐\n\n` +
        `💳 **رصيدك المتبقي:** \`${senderNew.toLocaleString()}\` ⭐`
      )
      .setFooter({ text: 'ZENO Economy System • Star Coin', iconURL: message.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
