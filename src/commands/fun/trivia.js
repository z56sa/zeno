const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');

// أسئلة بدون خيارات - اللاعب يكتب الإجابة
const TRIVIA_QUESTIONS = [
  { q: 'ما عاصمة المملكة العربية السعودية؟', answers: ['الرياض', 'riyadh'] },
  { q: 'كم عدد سور القرآن الكريم؟', answers: ['114'] },
  { q: 'ما هو أكبر محيط في العالم؟', answers: ['الهادئ', 'المحيط الهادئ', 'pacific'] },
  { q: 'ما هو الكوكب الأقرب إلى الشمس؟', answers: ['عطارد', 'mercury'] },
  { q: 'من اخترع الهاتف؟', answers: ['ألكساندر غراهام بيل', 'غراهام بيل', 'alexander graham bell', 'graham bell'] },
  { q: 'كم يوم في السنة الكبيسة؟', answers: ['366'] },
  { q: 'ما هو أطول نهر في العالم؟', answers: ['النيل', 'nile'] },
  { q: 'ما هو أصغر دولة في العالم؟', answers: ['الفاتيكان', 'vatican'] },
  { q: 'كم عدد لاعبي كرة القدم في كل فريق أثناء اللعب؟', answers: ['11', 'أحد عشر'] },
  { q: 'ما هو عنصر الهواء الأكثر وفرة؟', answers: ['النيتروجين', 'nitrogen'] },
  { q: 'في أي عام وُلد النبي محمد ﷺ؟', answers: ['570'] },
  { q: 'ما عاصمة اليابان؟', answers: ['طوكيو', 'tokyo'] },
  { q: 'كم عدد القارات في العالم؟', answers: ['7', 'سبع', 'سبعة'] },
  { q: 'ما هو الرمز الكيميائي للذهب؟', answers: ['au'] },
  { q: 'من رسم لوحة الموناليزا؟', answers: ['ليوناردو دافينشي', 'دافينشي', 'da vinci', 'leonardo da vinci'] },
  { q: 'ما هو أسرع حيوان بري في العالم؟', answers: ['الفهد', 'cheetah'] },
  { q: 'ما اسم أول إنسان مشى على سطح القمر؟', answers: ['نيل أرمسترونج', 'armstrong', 'neil armstrong'] },
  { q: 'ما هي عاصمة فرنسا؟', answers: ['باريس', 'paris'] },
  { q: 'كم عدد أيام شهر فبراير في السنة العادية؟', answers: ['28', 'ثمانية وعشرون'] },
  { q: 'ما هي أكبر قارة في العالم؟', answers: ['آسيا', 'asia'] },
  { q: 'من هو مؤسس شركة Microsoft؟', answers: ['بيل غيتس', 'bill gates', 'غيتس'] },
  { q: 'ما هي عاصمة مصر؟', answers: ['القاهرة', 'cairo'] },
  { q: 'كم عدد أضلاع المثلث؟', answers: ['3', 'ثلاثة'] },
  { q: 'ما هي لغة البرمجة التي تستخدمها هذا البوت؟', answers: ['javascript', 'جافاسكريبت', 'js'] },
  { q: 'ما اسم أطول جدار في العالم؟', answers: ['سور الصين العظيم', 'great wall of china', 'سور الصين'] },
];

const activeGames = new Map();

// تحقق من الإجابة بشكل مرن (بدون تحسس حروف، تجاهل مسافات)
function checkAnswer(userAnswer, correctAnswers) {
  const normalized = userAnswer.trim().toLowerCase();
  return correctAnswers.some(ans => ans.toLowerCase() === normalized || normalized.includes(ans.toLowerCase()));
}

module.exports = {
  name: 'trivia',
  description: 'مسابقة معلومات عامة - اكتب إجابتك! 🧠',
  aliases: ['سؤال', 'مسابقة'],
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('مسابقة معلومات عامة - اكتب إجابتك وتنافس! 🧠'),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ يوجد مسابقة جارية في هذه القناة!', flags: 64 });
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
        `• **اكتب إجابتك مباشرة في الشات** (بدون ضغط أزرار)\n` +
        `• أول من يكتب الإجابة الصحيحة يربح **Star Coins ⭐**\n` +
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

    const msg = await interaction.reply({ embeds: [buildLobbyEmbed()], components: [lobbyRow], withResponse: true });

    const lobbyCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    lobbyCollector.on('collect', async (btn) => {
      if (btn.customId === 'trv_join') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في المسابقة!', flags: 64 });
        players.add(btn.user.id);
        await msg.edit({ embeds: [buildLobbyEmbed()] });
        await btn.reply({ content: `✅ انضممت للمسابقة! عدد المشتركين: **${players.size}**`, flags: 64 });
      }

      if (btn.customId === 'trv_start') {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: '❌ فقط صاحب الغرفة يستطيع البدء!', flags: 64 });
        await btn.deferUpdate();
        lobbyCollector.stop('start');
      }

      if (btn.customId === 'trv_cancel') {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', flags: 64 });
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

      // اختيار سؤال عشوائي
      const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
      const reward = Math.floor(Math.random() * 101) + 50; // 50-150
      activeGames.set(interaction.channelId, true);

      const questionEmbed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🧠 سؤال المسابقة')
        .setDescription(`**${q.q}**`)
        .setFooter({ text: `✍️ اكتب إجابتك في الشات | ⏱️ لديكم 30 ثانية | 🎁 المكافأة: +${reward} ⭐ | 👥 المشتركون: ${players.size}` })
        .setTimestamp();

      await msg.edit({ embeds: [questionEmbed], components: [] });

      // مستمع رسائل الشات
      let winner = null;
      const answered = new Set();
      const eliminated = new Set(); // اللاعبون المطرودون

      const messageCollector = interaction.channel.createMessageCollector({
        filter: m => players.has(m.author.id) && !m.author.bot && !eliminated.has(m.author.id),
        time: 30000
      });

      messageCollector.on('collect', async (m) => {
        const userId = m.author.id;

        // تجاهل المطرودين أو الفائزين
        if (eliminated.has(userId) || answered.has(userId)) return;

        const correct = checkAnswer(m.content, q.answers);

        if (correct && !winner) {
          winner = m.author;
          answered.add(userId);
          db.addCoins(userId, interaction.guild.id, reward);
          await m.react('✅').catch(() => {});
          await m.reply(`🎉 **إجابة صحيحة يا ${m.author.username}!** ربحت \`+${reward}\` ⭐`);
          messageCollector.stop('winner');

        } else if (correct && winner) {
          answered.add(userId);
          await m.react('✅').catch(() => {});
          await m.reply(`✅ إجابة صحيحة! لكن **${winner.username}** كان أسرع منك.`);

        } else {
          // إجابة خاطئة — طرد فوري
          eliminated.add(userId);
          players.delete(userId);

          const lossEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('💀 خرجت من المسابقة!')
            .setDescription(
              `يا **${m.author.username}**، أجبت بـ \`${m.content}\` وهي إجابة **خاطئة**!\n\n` +
              `❌ **تم استبعادك** من المسابقة ولا تستطيع المشاركة مجدداً.\n\n` +
              `⏳ انتظر النتيجة النهائية...`
            )
            .setThumbnail(m.author.displayAvatarURL())
            .setTimestamp();

          await interaction.channel.send({ embeds: [lossEmbed] });

          if (players.size === 0) {
            messageCollector.stop('no_players');
          }
        }
      });

      messageCollector.on('end', async (collected, reason) => {
        activeGames.delete(interaction.channelId);

        const resultEmbed = new EmbedBuilder()
          .setColor(winner ? '#2ecc71' : reason === 'no_players' ? '#ED4245' : '#95a5a6')
          .setTitle(winner ? `🏆 ${winner.username} فاز بالمسابقة!` : reason === 'no_players' ? '💀 انتهت المسابقة - كل اللاعبين طُردوا!' : '⏰ انتهى الوقت بدون فائز!')
          .setDescription(
            `**❓ السؤال:** ${q.q}\n\n` +
            `**✅ الإجابة الصحيحة:** \`${q.answers[0]}\`\n\n` +
            (winner ? `🎁 **${winner.username}** ربح \`+${reward}\` ⭐!` : reason === 'no_players' ? `😵 جميع اللاعبين طُردوا بسبب الأخطاء!` : `😔 لم يجب أحد بشكل صحيح!`)
          )
          .setTimestamp();

        await msg.edit({ embeds: [resultEmbed] });
      });
    });
  },

  async executePrefix(message, args) {
    if (activeGames.has(message.channelId)) {
      return message.reply('⚠️ يوجد مسابقة جارية في هذه القناة!');
    }

    const players = new Set([message.author.id]);
    activeGames.set(message.channelId, true);

    const buildLobbyEmbed = () => new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🧠 مسابقة المعلومات العامة!')
      .setDescription(
        `**${message.author.username}** فتح جلسة مسابقة!\n\n` +
        `✍️ **اكتب إجابتك مباشرة في الشات!**\n` +
        `أول من يكتب الصح يربح **Star Coins ⭐**\n\n` +
        `👥 **المشتركون (${players.size}):** ${[...players].map(id => `<@${id}>`).join(', ')}`
      )
      .setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية' })
      .setTimestamp();

    const lobbyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trv_join_p').setLabel('🧠 انضم').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('trv_start_p').setLabel('▶️ ابدأ').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trv_cancel_p').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
    );

    const msg = await message.reply({ embeds: [buildLobbyEmbed()], components: [lobbyRow] });

    const lobbyCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    lobbyCollector.on('collect', async (btn) => {
      if (btn.customId === 'trv_join_p') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في المسابقة!', flags: 64 });
        players.add(btn.user.id);
        await msg.edit({ embeds: [buildLobbyEmbed()] });
        await btn.reply({ content: `✅ انضممت! عدد المشتركين: **${players.size}**`, flags: 64 });
      }
      if (btn.customId === 'trv_start_p') {
        if (btn.user.id !== message.author.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', flags: 64 });
        await btn.deferUpdate();
        lobbyCollector.stop('start');
      }
      if (btn.customId === 'trv_cancel_p') {
        if (btn.user.id !== message.author.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', flags: 64 });
        await btn.deferUpdate();
        lobbyCollector.stop('cancel');
      }
    });

    lobbyCollector.on('end', async (collected, reason) => {
      activeGames.delete(message.channelId);

      if (reason === 'cancel') {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ مسابقة - ألغيت').setDescription('تم إلغاء المسابقة.')], components: [] });
      }

      const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
      const reward = Math.floor(Math.random() * 101) + 50;
      activeGames.set(message.channelId, true);

      const questionEmbed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🧠 سؤال المسابقة')
        .setDescription(`**${q.q}**`)
        .setFooter({ text: `✍️ اكتب إجابتك | ⏱️ 30 ثانية | 🎁 +${reward} ⭐` })
        .setTimestamp();

      await msg.edit({ embeds: [questionEmbed], components: [] });

      let winner = null;
      const answered = new Set();

      const messageCollector = message.channel.createMessageCollector({
        filter: m => players.has(m.author.id) && !m.author.bot,
        time: 30000
      });

      messageCollector.on('collect', async (m) => {
        if (answered.has(m.author.id)) return;
        const correct = checkAnswer(m.content, q.answers);
        if (correct && !winner) {
          winner = m.author;
          answered.add(m.author.id);
          db.addCoins(m.author.id, message.guild.id, reward);
          await m.react('✅').catch(() => {});
          await m.reply(`🎉 **إجابة صحيحة يا ${m.author.username}!** ربحت \`+${reward}\` ⭐`);
          messageCollector.stop('winner');
        } else if (correct && winner) {
          answered.add(m.author.id);
          await m.react('✅').catch(() => {});
          await m.reply(`✅ إجابة صحيحة! لكن **${winner.username}** كان أسرع منك.`);
        } else {
          await m.react('❌').catch(() => {});
        }
      });

      messageCollector.on('end', async () => {
        activeGames.delete(message.channelId);
        const resultEmbed = new EmbedBuilder()
          .setColor(winner ? '#2ecc71' : '#95a5a6')
          .setTitle(winner ? `🏆 ${winner.username} فاز!` : '⏰ انتهى الوقت!')
          .setDescription(
            `**❓ السؤال:** ${q.q}\n\n` +
            `**✅ الإجابة الصحيحة:** \`${q.answers[0]}\`\n\n` +
            (winner ? `🎁 **${winner.username}** ربح \`+${reward}\` ⭐!` : `😔 لم يجب أحد!`)
          )
          .setTimestamp();
        await msg.edit({ embeds: [resultEmbed] });
      });
    });
  }
};
