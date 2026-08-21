const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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

const activeGames = new Map();

module.exports = {
  name: 'trivia',
  description: 'مسابقة معلومات عامة - تنافس مع الآخرين! 🧠',
  aliases: ['سؤال', 'مسابقة'],
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('مسابقة معلومات عامة - انضم وتنافس على Star Coins! 🧠'),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ يوجد مسابقة جارية في هذه القناة!', ephemeral: true });
    }

    const players = new Set([interaction.user.id]);
    activeGames.set(interaction.channelId, true);

    const buildLobbyEmbed = () => new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🧠 مسابقة المعلومات العامة!')
      .setDescription(
        `**${interaction.user.username}** فتح جلسة مسابقة!\n\n` +
        `📋 **القواعد:**\n` +
        `• سيُطرح سؤال على الجميع في نفس الوقت\n` +
        `• أول من يجيب صحيحاً يربح **Star Coins ⭐**\n` +
        `• لديكم **30 ثانية** للإجابة\n\n` +
        `👥 **المشتركون (${players.size}):** ${[...players].map(id => `<@${id}>`).join(', ')}`
      )
      .setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية | صاحب الغرفة يضغط ابدأ' })
      .setTimestamp();

    const lobbyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trv_join').setLabel('🧠 انضم للمسابقة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('trv_start').setLabel('▶️ ابدأ المسابقة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trv_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({ embeds: [buildLobbyEmbed()], components: [lobbyRow], fetchReply: true });

    const lobbyCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    lobbyCollector.on('collect', async (btn) => {
      if (btn.customId === 'trv_join') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في المسابقة!', ephemeral: true });
        players.add(btn.user.id);
        await msg.edit({ embeds: [buildLobbyEmbed()] });
        await btn.reply({ content: `✅ انضممت للمسابقة! عدد المشتركين: **${players.size}**`, ephemeral: true });
      }

      if (btn.customId === 'trv_start') {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: '❌ فقط صاحب الغرفة يستطيع البدء!', ephemeral: true });
        await btn.deferUpdate();
        lobbyCollector.stop('start');
      }

      if (btn.customId === 'trv_cancel') {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        await btn.deferUpdate();
        lobbyCollector.stop('cancel');
      }
    });

    lobbyCollector.on('end', async (collected, reason) => {
      activeGames.delete(interaction.channelId);

      if (reason === 'cancel') {
        return msg.edit({
          embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ مسابقة - ألغيت').setDescription('تم إلغاء المسابقة.')],
          components: []
        });
      }

      // بدء السؤال
      const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
      const reward = Math.floor(Math.random() * 101) + 50;
      const answered = new Set(); // من أجاب بالفعل

      const questionEmbed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🧠 سؤال المسابقة')
        .setDescription(`**${q.q}**`)
        .setFooter({ text: `⏱️ لديكم 30 ثانية | 🎁 المكافأة: +${reward} ⭐ لأول مجيب صحيح | 👥 المشتركون: ${players.size}` });

      const labels = ['أ', 'ب', 'ج', 'د'];
      const buttons = q.options.map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`trv_ans_${i}`)
          .setLabel(`${labels[i]}) ${opt}`)
          .setStyle(ButtonStyle.Primary)
      );

      const rows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 2)));
      }

      await msg.edit({ embeds: [questionEmbed], components: rows });

      let winner = null;
      activeGames.set(interaction.channelId, true);

      const answerCollector = msg.createMessageComponentCollector({
        filter: i => players.has(i.user.id) && i.customId.startsWith('trv_ans_'),
        time: 30000
      });

      answerCollector.on('collect', async (i) => {
        if (answered.has(i.user.id)) {
          return i.reply({ content: '⚠️ لقد أجبت بالفعل!', ephemeral: true });
        }

        answered.add(i.user.id);
        const chosen = parseInt(i.customId.split('_')[2]);
        const correct = chosen === q.answer;

        if (correct && !winner) {
          winner = i.user;
          db.addCoins(i.user.id, interaction.guild.id, reward);
          await i.reply({ content: `🎉 **إجابة صحيحة!** ربحت +\`${reward}\` ⭐`, ephemeral: true });
          answerCollector.stop('winner');
        } else if (correct && winner) {
          await i.reply({ content: `✅ إجابة صحيحة! لكن **${winner.username}** كان أسرع منك.`, ephemeral: true });
        } else {
          await i.reply({ content: `❌ إجابة خاطئة! حاول مرة أخرى في السؤال القادم.`, ephemeral: true });
        }
      });

      answerCollector.on('end', async (collected, reason) => {
        activeGames.delete(interaction.channelId);
        const resultEmbed = new EmbedBuilder()
          .setColor(winner ? '#2ecc71' : '#95a5a6')
          .setTitle(winner ? `🏆 ${winner.username} فاز بالمسابقة!` : '⏰ انتهى الوقت!')
          .setDescription(
            `**السؤال:** ${q.q}\n\n` +
            `**✅ الإجابة الصحيحة:** ${q.options[q.answer]}\n\n` +
            (winner ? `🎁 **${winner.username}** ربح \`+${reward}\` ⭐!` : `😔 لم يجب أحد بشكل صحيح!`) +
            `\n\n**👥 المشتركون:** ${[...players].map(id => `<@${id}>`).join(', ')}`
          )
          .addFields({ name: '📊 الإجابات', value: `${answered.size}/${players.size} لاعب أجاب` })
          .setTimestamp();

        await msg.edit({ embeds: [resultEmbed], components: [] });
      });
    });
  },

  async executePrefix(message) {
    return message.reply('❌ استخدم `/trivia` لبدء مسابقة معلومات عامة.');
  }
};
