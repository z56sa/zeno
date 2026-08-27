const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'ping',
  description: 'عرض سرعة استجابة البوت (Ping)',
  aliases: ['p', 'بنج'],
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('عرض سرعة استجابة البوت (Ping)'),

  async execute(interaction, client) {
    const sent = await interaction.reply({ content: 'جاري القياس...', withResponse: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🏓 سرعة الاستجابة (Pong!)')
      .addFields(
        { name: '📡 زمن الاستجابة (Latency)', value: `\`${latency}ms\``, inline: true },
        { name: '🌐 سرعة اتصال الديسكورد (API)', value: `\`${apiLatency}ms\``, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const sent = await message.reply('جاري القياس...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🏓 سرعة الاستجابة (Pong!)')
      .addFields(
        { name: '📡 زمن الاستجابة (Latency)', value: `\`${latency}ms\``, inline: true },
        { name: '🌐 سرعة اتصال الديسكورد (API)', value: `\`${apiLatency}ms\``, inline: true }
      )
      .setTimestamp();

    await sent.edit({ content: null, embeds: [embed] });
  }
};
