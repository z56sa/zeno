const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'daily',
  description: 'استلام مكافأتك اليومية المجانية من عملة STAR COIN ⭐',
  aliases: ['راتب', 'يومي', 'مكافأة', 'starsdaily'],
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('استلام مكافأتك اليومية من عملة STAR COIN ⭐'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const user = db.getUser(userId, guildId);

    const cooldown = 24 * 60 * 60 * 1000; // 24 ساعة
    const lastDaily = user.last_daily || 0;
    const now = Date.now();

    if (now - lastDaily < cooldown) {
      const remaining = cooldown - (now - lastDaily);
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

      const embedWait = new EmbedBuilder()
        .setColor('#ff4757')
        .setTitle('⏳ لقد استلمت مكافأتك اليومية بالفعل!')
        .setDescription(`يمكنك استلام مكافأتك القادمة بعد:\n⏱️ **${hours} ساعة و ${minutes} دقيقة**`)
        .setFooter({ text: 'STAR COIN Daily Rewards' });

      return interaction.reply({ embeds: [embedWait], ephemeral: true });
    }

    const rewardAmount = 100;
    const newBalance = db.setDaily(userId, guildId, now, rewardAmount);

    const embedSuccess = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle('🎉 تم استلام المكافأة اليومية بنجاح!')
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription(
        `💰 **المبلغ المستلم:** \`+${rewardAmount}\` **STAR COIN** ⭐\n` +
        `💳 **رصيدك الكلي الآن:** \`${newBalance.toLocaleString()}\` **STAR COIN** ⭐\n\n` +
        `📅 عد غداً لاستلام مكافأة يومية جديدة!`
      )
      .setFooter({ text: 'ZENO Economy System • Star Coin', iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embedSuccess] });
  },

  async executePrefix(message, args) {
    const userId = message.author.id;
    const guildId = message.guild.id;
    const user = db.getUser(userId, guildId);

    const cooldown = 24 * 60 * 60 * 1000;
    const lastDaily = user.last_daily || 0;
    const now = Date.now();

    if (now - lastDaily < cooldown) {
      const remaining = cooldown - (now - lastDaily);
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

      const embedWait = new EmbedBuilder()
        .setColor('#ff4757')
        .setTitle('⏳ لقد استلمت مكافأتك اليومية بالفعل!')
        .setDescription(`يمكنك استلام مكافأتك القادمة بعد:\n⏱️ **${hours} ساعة و ${minutes} دقيقة**`)
        .setFooter({ text: 'STAR COIN Daily Rewards' });

      return message.reply({ embeds: [embedWait] });
    }

    const rewardAmount = 100;
    const newBalance = db.setDaily(userId, guildId, now, rewardAmount);

    const embedSuccess = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle('🎉 تم استلام المكافأة اليومية بنجاح!')
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription(
        `💰 **المبلغ المستلم:** \`+${rewardAmount}\` **STAR COIN** ⭐\n` +
        `💳 **رصيدك الكلي الآن:** \`${newBalance.toLocaleString()}\` **STAR COIN** ⭐\n\n` +
        `📅 عد غداً لاستلام مكافأة يومية جديدة!`
      )
      .setFooter({ text: 'ZENO Economy System • Star Coin', iconURL: message.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await message.reply({ embeds: [embedSuccess] });
  }
};
