const { SlashCommandBuilder } = require('discord.js');
const audioManager = require('../../utils/audioPlayer');

module.exports = {
  name: 'stop',
  description: 'إيقاف تشغيل الصوت أو القرآن ومغادرة الروم الصوتي',
  aliases: ['ايقاف', 'ليف', 'خروج', 'leave'],
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('إيقاف الصوت ومغادرة الروم الصوتي'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }).catch(() => { });

    const stopped = audioManager.stop(interaction.guild.id);
    if (stopped) {
      await interaction.deleteReply().catch(() => { });
      await interaction.channel.send('⏹️ **تم إيقاف التشغيل ومغادرة الروم الصوتي بنجاح.**');
    } else {
      await interaction.editReply({ content: '❌ البوت لا يقوم بتشغيل أي صوت حالياً في هذا السيرفر.' });
    }
  },

  async executePrefix(message) {
    const stopped = audioManager.stop(message.guild.id);
    if (stopped) {
      message.reply('⏹️ **تم إيقاف التشغيل ومغادرة الروم الصوتي.**');
    } else {
      message.reply('❌ البوت لا يقوم بتشغيل أي صوت حالياً.');
    }
  }
};