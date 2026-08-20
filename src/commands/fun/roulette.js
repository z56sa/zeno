const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

// لعبة الروليت - يختار البوت عشوائياً ضحية من المتواجدين في الروم الصوتي أو من المنشن
module.exports = {
  name: 'roulette',
  description: 'لعبة الروليت - حظك مع مين؟',
  aliases: ['روليت'],
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('لعبة الروليت - البوت يختار ضحية عشوائية!'),

  async execute(interaction) {
    const members = interaction.guild.members.cache.filter(m => !m.user.bot);
    if (members.size < 2) {
      return interaction.reply({ content: '❌ يجب وجود عضوين على الأقل في السيرفر!', ephemeral: true });
    }

    const randomMember = members.random();

    const outcomes = [
      { text: `💀 انتهت عليك يا **${randomMember.displayName}**! البوت اختارك كضحية الجولة!`, color: '#ED4245' },
      { text: `🎯 **${randomMember.displayName}** أنت المحظوظ (أو غير المحظوظ)!`, color: '#FEE75C' },
      { text: `🔫 طق! الرصاصة وصلت لـ **${randomMember.displayName}**!`, color: '#ED4245' },
    ];

    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

    const embed = new EmbedBuilder()
      .setColor(outcome.color)
      .setTitle('🎰 لعبة الروليت!')
      .setDescription(outcome.text)
      .setThumbnail(randomMember.user.displayAvatarURL())
      .setFooter({ text: `طُلب من: ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message) {
    const members = message.guild.members.cache.filter(m => !m.user.bot);
    if (members.size < 2) {
      return message.reply('❌ يجب وجود عضوين على الأقل في السيرفر!');
    }

    const randomMember = members.random();

    const outcomes = [
      { text: `💀 انتهت عليك يا **${randomMember.displayName}**! البوت اختارك كضحية الجولة!`, color: '#ED4245' },
      { text: `🎯 **${randomMember.displayName}** أنت المحظوظ (أو غير المحظوظ)!`, color: '#FEE75C' },
      { text: `🔫 طق! الرصاصة وصلت لـ **${randomMember.displayName}**!`, color: '#ED4245' },
    ];

    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

    const embed = new EmbedBuilder()
      .setColor(outcome.color)
      .setTitle('🎰 لعبة الروليت!')
      .setDescription(outcome.text)
      .setThumbnail(randomMember.user.displayAvatarURL())
      .setFooter({ text: `طُلب من: ${message.author.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
