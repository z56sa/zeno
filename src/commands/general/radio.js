const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const audioManager = require('../../utils/audioPlayer');
const config = require('../../config.json');

module.exports = {
  name: 'radio',
  description: 'تشغيل إذاعة القرآن الكريم مباشرة 24/7 في الروم الصوتي',
  aliases: ['راديو', 'اذاعة'],
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('تشغيل إذاعة القرآن الكريم 24/7')
    .addStringOption(opt =>
      opt.setName('station')
        .setDescription('اختر الإذاعة')
        .setRequired(false)
        .addChoices(
          { name: '📻 إذاعة القرآن الكريم من القاهرة', value: 'cairo_radio' },
          { name: '📻 إذاعة القرآن الكريم من مكة المكرمة', value: 'makkah_radio' }
        )
    ),

  async execute(interaction) {
    const memberVoice = interaction.member.voice.channel;
    if (!memberVoice) {
      return interaction.reply({ content: '❌ يجب أن تكون متواجداً في روم صوتي لتشغيل الإذاعة.', ephemeral: true });
    }

    await interaction.deferReply();
    const stationKey = interaction.options.getString('station') || 'cairo_radio';
    const station = audioManager.quranStations[stationKey] || audioManager.quranStations.cairo_radio;

    await audioManager.playStream(memberVoice, station.url, station.name);

    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('📻 جاري تشغيل البث المباشر للإذاعة')
      .setDescription(`🎙️ **المحطة:** ${station.name}\n📍 **الروم الصوتي:** <#${memberVoice.id}>\n⚡ البث متواصل 24/7`)
      .setFooter({ text: 'لإيقاف البث استخدم /stop' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message) {
    const memberVoice = message.member?.voice.channel;
    if (!memberVoice) return message.reply('❌ يجب أن تكون في روم صوتي.');

    const station = audioManager.quranStations.cairo_radio;
    await audioManager.playStream(memberVoice, station.url, station.name);

    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('📻 جاري تشغيل إذاعة القرآن الكريم')
      .setDescription(`🎙️ **المحطة:** ${station.name}\n📍 **الروم:** <#${memberVoice.id}>`)
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};
