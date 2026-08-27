const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const audioManager = require('../../utils/audioPlayer');
const config = require('../../config.json');

module.exports = {
  name: 'quran',
  description: 'تشغيل تلاوات القرآن الكريم وإذاعات كبار القراء في الروم الصوتي',
  aliases: ['قران', 'القران'],
  data: new SlashCommandBuilder()
    .setName('quran')
    .setDescription('تشغيل القرآن الكريم وإذاعات القراء')
    .addStringOption(opt =>
      opt.setName('reciter')
        .setDescription('اختر القارئ أو الإذاعة')
        .setRequired(false)
        .addChoices(
          { name: '📻 إذاعة القرآن الكريم من القاهرة (24/7)', value: 'cairo_radio' },
          { name: '📻 إذاعة القرآن الكريم من مكة المكرمة (24/7)', value: 'makkah_radio' },
          { name: '📖 الشيخ مشاري راشد العفاسي', value: 'afasy' },
          { name: '📖 الشيخ عبدالباسط عبدالصمد', value: 'abdulbasit' },
          { name: '📖 الشيخ ماهر المعيقلي', value: 'muaiqly' },
          { name: '📖 الشيخ ياسر الدوسري', value: 'dosari' },
          { name: '📖 الشيخ سعد الغامدي', value: 'ghamdi' }
        )
    ),

  async execute(interaction) {
    const memberVoice = interaction.member.voice.channel;
    if (!memberVoice) {
      return interaction.reply({ content: '❌ يجب أن تكون متواجداً في روم صوتي لتشغيل القرآن الكريم.', flags: 64 });
    }

    const reciterKey = interaction.options.getString('reciter');

    if (reciterKey && audioManager.quranStations[reciterKey]) {
      await interaction.deferReply();
      const station = audioManager.quranStations[reciterKey];
      await audioManager.playStream(memberVoice, station.url, station.name);

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔊 جاري تشغيل القرآن الكريم')
        .setDescription(`📖 **المحطة / القارئ:** ${station.name}\n📍 **الروم الصوتي:** <#${memberVoice.id}>`)
        .setFooter({ text: 'لإيقاف الصوت استخدم أمر /stop' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // عرض القائمة التفاعلية لاختيار القارئ
    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('quran_select_menu')
        .setPlaceholder('اختر القارئ أو الإذاعة التي تود الاستماع إليها...')
        .addOptions([
          { label: 'إذاعة القرآن من القاهرة', value: 'cairo_radio', emoji: '📻', description: 'بث مباشر 24/7' },
          { label: 'إذاعة القرآن من مكة المكرمة', value: 'makkah_radio', emoji: '📻', description: 'بث مباشر 24/7' },
          { label: 'الشيخ مشاري راشد العفاسي', value: 'afasy', emoji: '📖', description: 'تلاوات خاشعة' },
          { label: 'الشيخ عبدالباسط عبدالصمد', value: 'abdulbasit', emoji: '📖', description: 'المصحف المجود' },
          { label: 'الشيخ ماهر المعيقلي', value: 'muaiqly', emoji: '📖', description: 'تلاوة الحرم المكي' },
          { label: 'الشيخ ياسر الدوسري', value: 'dosari', emoji: '📖', description: 'تلاوة مؤثرة' },
          { label: 'الشيخ سعد الغامدي', value: 'ghamdi', emoji: '📖', description: 'تلاوة عطرة' }
        ])
    );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📖 إذاعات وتلاوات القرآن الكريم')
      .setDescription('اختر الإذاعة أو القارئ من القائمة المنسدلة أدناه لتشغيل التلاوة في الروم الصوتي:')
      .setTimestamp();

    const response = await interaction.reply({ embeds: [embed], components: [selectMenu], withResponse: true });

    const collector = response.createMessageComponentCollector({
      filter: (i) => i.customId === 'quran_select_menu' && i.user.id === interaction.user.id,
      time: 60000,
      max: 1
    });

    collector.on('collect', async (i) => {
      const selected = i.values[0];
      const station = audioManager.quranStations[selected];
      if (station) {
        await audioManager.playStream(memberVoice, station.url, station.name);
        const successEmbed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('🔊 جاري تشغيل القرآن الكريم')
          .setDescription(`📖 **المحطة / القارئ:** ${station.name}\n📍 **الروم الصوتي:** <#${memberVoice.id}>`)
          .setTimestamp();

        await i.update({ embeds: [successEmbed], components: [] });
      }
    });
  }
};
