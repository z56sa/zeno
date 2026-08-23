const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'apply',
  description: 'التقديم على الرتب والوظائف المتاحة في السيرفر',
  aliases: ['تقديم', 'طلب_تقديم'],
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('التقديم وتعبئة استمارة التقديم في السيرفر'),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const apps = db.getApplications(guildId);

    if (!apps || apps.length === 0) {
      return interaction.reply({ content: '❌ لا توجد أي استمارات تقديم مفتوحة حالياً في هذا السيرفر.', ephemeral: true });
    }

    // إذا كان هناك تقديم واحد فقط، افتح المودال فوراً
    if (apps.length === 1) {
      const app = apps[0];
      return showApplicationModal(interaction, app);
    }

    // إذا كان هناك أكثر من تقديم، اعرض قائمة اختيار
    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_apply_form')
        .setPlaceholder('اختر استمارة التقديم التي ترغب بتعبئتها...')
        .addOptions(
          apps.slice(0, 25).map(a => ({
            label: a.title,
            value: a.id.toString(),
            description: (a.description || 'اضغط لتعبئة النموذج').slice(0, 90),
            emoji: '📝'
          }))
        )
    );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📝 استمارات التقديم المتاحة')
      .setDescription('يرجى اختيار نموذج التقديم المناسب من القائمة بالأسفل للبدء بتعبئة الاستمارة:')
      .setFooter({ text: `${interaction.guild.name} • نظام التقديمات` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], components: [selectMenu], ephemeral: true });
  }
};

function showApplicationModal(interaction, app) {
  let questions = [];
  try {
    questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
  } catch (e) {
    questions = ['ما هو سبب تقديمك؟', 'ما هي خبراتك السابقة؟'];
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_submit_app_${app.id}`)
    .setTitle(`📝 ${app.title.slice(0, 40)}`);

  questions.slice(0, 5).forEach((q, idx) => {
    const input = new TextInputBuilder()
      .setCustomId(`q_${idx}`)
      .setLabel(q.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return interaction.showModal(modal);
}
