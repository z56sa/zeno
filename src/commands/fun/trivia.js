const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

const TRIVIA_QUESTIONS = [
  { q: 'ما عاصمة المملكة العربية السعودية؟', options: ['الرياض', 'جدة', 'مكة', 'الدمام'], answer: 0 },
  { q: 'كم عدد سور القرآن الكريم؟', options: ['110', '114', '120', '100'], answer: 1 },
  { q: 'من هو أول رئيس وزراء في تاريخ بريطانيا؟', options: ['ونستون تشرشل', 'روبرت والبول', 'توني بلير', 'مارغريت ثاتشر'], answer: 1 },
  { q: 'ما هو أكبر محيط في العالم؟', options: ['المحيط الأطلسي', 'المحيط الهندي', 'المحيط الهادئ', 'المحيط المتجمد'], answer: 2 },
  { q: 'ما هو الكوكب الأقرب إلى الشمس؟', options: ['الزهرة', 'عطارد', 'المريخ', 'الأرض'], answer: 1 },
  { q: 'كم تساوي قيمة π (باي) تقريباً؟', options: ['3.14', '2.71', '1.41', '3.17'], answer: 0 },
  { q: 'من اخترع الهاتف؟', options: ['توماس إديسون', 'ألكساندر غراهام بيل', 'نيكولا تسلا', 'ماركوني'], answer: 1 },
  { q: 'ما هي اللغة الأكثر انتشاراً في العالم؟', options: ['الإنجليزية', 'الصينية (الماندرين)', 'الإسبانية', 'العربية'], answer: 1 },
  { q: 'كم يوم في السنة الكبيسة؟', options: ['365', '366', '364', '367'], answer: 1 },
  { q: 'أي دولة اخترعت لعبة الشطرنج؟', options: ['الصين', 'الفارسية (إيران)', 'الهند', 'اليونان'], answer: 2 },
  { q: 'ما هو أطول نهر في العالم؟', options: ['الأمازون', 'النيل', 'المسيسيبي', 'اليانغتسي'], answer: 1 },
  { q: 'ما هو أصغر دولة في العالم؟', options: ['موناكو', 'سان مارينو', 'الفاتيكان', 'ليختنشتاين'], answer: 2 },
  { q: 'كم عدد لاعبي كرة القدم في كل فريق؟', options: ['10', '11', '12', '9'], answer: 1 },
  { q: 'ما هو عنصر الهواء الأكثر وفرة؟', options: ['الأكسجين', 'النيتروجين', 'ثاني أكسيد الكربون', 'الهيدروجين'], answer: 1 },
  { q: 'في أي عام وُلد النبي محمد ﷺ؟', options: ['570 م', '571 م', '569 م', '572 م'], answer: 0 },
  { q: 'ما عاصمة اليابان؟', options: ['أوساكا', 'كيوتو', 'طوكيو', 'هيروشيما'], answer: 2 },
  { q: 'كم عدد القارات؟', options: ['5', '6', '7', '8'], answer: 2 },
  { q: 'ما هو الرمز الكيميائي للذهب؟', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2 },
  { q: 'من رسم لوحة الموناليزا؟', options: ['مايكل أنجلو', 'ليوناردو دافينشي', 'رافائيل', 'فان غوخ'], answer: 1 },
  { q: 'ما هو أسرع حيوان بري؟', options: ['الأسد', 'الفهد', 'النمر', 'الحصان'], answer: 1 },
];

const ACTIVE_TRIVIA = new Map();

module.exports = {
  name: 'trivia',
  description: 'سؤال معلومات عامة واربح Star Coin! 🧠',
  aliases: ['سؤال', 'مسابقة'],
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('سؤال معلومات عامة واربح Star Coin ⭐ 🧠'),

  async execute(interaction) {
    if (ACTIVE_TRIVIA.has(interaction.user.id))
      return interaction.reply({ content: '⚠️ لديك سؤال قيد الانتظار بالفعل!', ephemeral: true });

    const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
    const reward = Math.floor(Math.random() * 101) + 50; // 50-150

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🧠 سؤال معلومات عامة')
      .setDescription(`**${q.q}**`)
      .setFooter({ text: `⏱️ لديك 30 ثانية للإجابة | 🎁 المكافأة: +${reward} ⭐` });

    const labels = ['أ', 'ب', 'ج', 'د'];
    const buttons = q.options.map((opt, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${i}`)
        .setLabel(`${labels[i]}) ${opt}`)
        .setStyle(ButtonStyle.Primary)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 2)));
    }

    const msg = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
    ACTIVE_TRIVIA.set(interaction.user.id, { answer: q.answer, reward, messageId: msg.id });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId.startsWith('trivia_'),
      time: 30000,
      max: 1
    });

    collector.on('collect', async (i) => {
      const chosen = parseInt(i.customId.split('_')[1]);
      const correct = chosen === q.answer;
      ACTIVE_TRIVIA.delete(interaction.user.id);

      if (correct) db.addCoins(interaction.user.id, interaction.guild.id, reward);

      const resultEmbed = new EmbedBuilder()
        .setColor(correct ? '#2ecc71' : '#e74c3c')
        .setTitle(correct ? '✅ إجابة صحيحة!' : '❌ إجابة خاطئة!')
        .setDescription(`**السؤال:** ${q.q}\n\n**الإجابة الصحيحة:** ${q.options[q.answer]}`)
        .addFields({ name: correct ? '🎁 ربحت' : '💔 لم تربح', value: correct ? `+${reward} ⭐` : '0 ⭐', inline: true })
        .setTimestamp();

      await i.update({ embeds: [resultEmbed], components: [] });
    });

    collector.on('end', (collected) => {
      ACTIVE_TRIVIA.delete(interaction.user.id);
      if (collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder().setColor('#95a5a6')
          .setTitle('⏰ انتهى الوقت!')
          .setDescription(`الإجابة الصحيحة كانت: **${q.options[q.answer]}**`);
        msg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
      }
    });
  },

  async executePrefix(message) {
    return message.reply('❌ هذا الأمر يعمل كـ Slash Command فقط. استخدم `/trivia`');
  }
};
