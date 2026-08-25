// ============================================================
// FILE: src/commands/general/games.js
// ألعاب وتسلية تفاعلية شاملة (لوحة أزرار وألعاب ذكاء وتحديات)
// ============================================================
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TRIVIA_QUESTIONS = [
  { q: "ما هي عاصمة أستراليا؟", options: ["سيدني", "كانبيرا", "ملبورن", "بيرث"], correct: 1 },
  { q: "كم عدد سور القرآن الكريم؟", options: ["110", "112", "114", "116"], correct: 2 },
  { q: "ما هو أكبر كوكب في المجموعة الشمسية؟", options: ["المشتري", "زحل", "الأرض", "نبتون"], correct: 0 },
  { q: "ما هو أسرع حيوان بري في العالم؟", options: ["الأسد", "الفهد الصياد", "الغزال", "الحصان"], correct: 1 },
  { q: "ما هو العنصر الكيميائي الذي رمزه O؟", options: ["الذهب", "الحديد", "الأكسجين", "الفضة"], correct: 2 },
  { q: "في أي قارة تقع دولة البرازيل؟", options: ["آسيا", "أفريقيا", "أمريكا الجنوبية", "أوروبا"], correct: 2 },
  { q: "ما هي أطول آية في القرآن الكريم؟", options: ["آية الكرسي", "آية الدين", "آية النور", "آية الملك"], correct: 1 },
  { q: "ما هي عاصمة اليابان؟", options: ["كيوتو", "طوكيو", "أوساكا", "هيروشيما"], correct: 1 }
];

const FAST_WORDS = [
  "القسطنطينية", "الاستقلال", "التكنولوجيا", "الذكاء_الاصطناعي", "المملكة_العربية_السعودية",
  "إمبراطورية", "ديسكورد_زينو", "برمجة_المستقبل", "الاستراتيجية", "الجمهورية"
];

module.exports = {
  name: 'games',
  description: 'ألعاب وتسلية تفاعلية مع أزرار وتحديات بالسيرفر',
  aliases: ['لعبة', 'العاب', 'تسلية', 'game'],
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription('قائمة الألعاب والتحديات التفاعلية')
    .addSubcommand(sub =>
      sub.setName('panel').setDescription('عرض لوحة الألعاب المباشرة مع أزرار تفاعلية')
    )
    .addSubcommand(sub =>
      sub.setName('trivia').setDescription('لعبة سؤال وجواب مع خيارات')
    )
    .addSubcommand(sub =>
      sub.setName('fast').setDescription('لعبة أسرع كتابة كلمة')
    )
    .addSubcommand(sub =>
      sub.setName('rps').setDescription('لعبة حجر ورقة مقص')
        .addStringOption(opt =>
          opt.setName('choice').setDescription('اختر حركتك')
            .setRequired(true)
            .addChoices(
              { name: '🪨 حجر (Rock)', value: 'rock' },
              { name: '📄 ورقة (Paper)', value: 'paper' },
              { name: '✂️ مقص (Scissors)', value: 'scissors' }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      const embed = new EmbedBuilder()
        .setColor('#9333ea')
        .setTitle('🎮 مركز الألعاب والتسلية | ZENO Games')
        .setDescription('اختر اللعبة التي تريد خوض التحدي بها الآن من خلال الأزرار التفاعلية أدناه:')
        .addFields(
          { name: '❓ سؤال وجواب (Trivia)', value: 'اختبر معلوماتك العامة مع 4 خيارات تفاعلية', inline: true },
          { name: '⚡ أسرع كتابة (Fast Type)', value: 'كن أسرع شخص يكتب الكلمة المعروضة', inline: true },
          { name: '✂️ حجر ورقة مقص (RPS)', value: 'تحدَّ الذكاء الاصطناعي في جولة سريعة', inline: true },
          { name: '🎲 النرد الحظ', value: 'ارمِ النرد واكتشف رقم حظك اليوم', inline: true },
          { name: '🪙 ملك أو كتابة', value: 'اقلب العملة واختبر حظك', inline: true }
        )
        .setFooter({ text: 'ZENO Games • العب واستمتع مع أصدقائك' })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('game_btn_trivia').setLabel('سؤال وجواب ❓').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('game_btn_fast').setLabel('أسرع كتابة ⚡').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('game_btn_rps').setLabel('حجر ورقة مقص ✂️').setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('game_btn_dice').setLabel('رمي النرد 🎲').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('game_btn_coin').setLabel('رمي العملة 🪙').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row1, row2] });
    }

    if (sub === 'trivia') {
      return runTrivia(interaction);
    }

    if (sub === 'fast') {
      return runFastType(interaction);
    }

    if (sub === 'rps') {
      const userChoice = interaction.options.getString('choice');
      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = choices[Math.floor(Math.random() * choices.length)];

      const choiceNames = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };

      let result = '';
      let color = '#9333ea';

      if (userChoice === botChoice) {
        result = '🤝 **تعادل!** اخترتما نفس الحركة.';
        color = '#eab308';
      } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
      ) {
        result = '🎉 **مبروك، لقد فزت على البوت!** 🏆';
        color = '#10b981';
      } else {
        result = '🤖 **البوت فاز عليك هذه المرة!** حظاً أوفر في الجولة القادمة.';
        color = '#ef4444';
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('✂️ حجر - ورقة - مقص')
        .setDescription(`👤 **اختيارك:** ${choiceNames[userChoice]}\n🤖 **اختيار البوت:** ${choiceNames[botChoice]}\n\n${result}`)
        .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};

async function runTrivia(interaction) {
  const item = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];

  const embed = new EmbedBuilder()
    .setColor('#9333ea')
    .setTitle('❓ سؤال وجواب | Trivia')
    .setDescription(`### ${item.q}\n\nاختر الإجابة الصحيحة بالضغط على الزر المناسب خلال 20 ثانية:`)
    .setFooter({ text: 'لديك 20 ثانية للإجابة' })
    .setTimestamp();

  const buttons = item.options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`trivia_ans_${i}`)
      .setLabel(opt)
      .setStyle(ButtonStyle.Primary)
  );

  const row = new ActionRowBuilder().addComponents(buttons);
  const replyMsg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  const collector = replyMsg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 20000,
    max: 1
  });

  collector.on('collect', async i => {
    const selected = parseInt(i.customId.replace('trivia_ans_', ''));
    const isCorrect = selected === item.correct;

    const resultEmbed = new EmbedBuilder()
      .setColor(isCorrect ? '#10b981' : '#ef4444')
      .setTitle(isCorrect ? '✅ إجابة صحيحة! أحسنت' : '❌ إجابة خاطئة!')
      .setDescription(`**السؤال:** ${item.q}\n**إجابتك:** ${item.options[selected]}\n**الإجابة الصحيحة:** ${item.options[item.correct]}`)
      .setFooter({ text: i.user.username, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    await i.update({ embeds: [resultEmbed], components: [] });
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      await interaction.editReply({
        content: `⏰ **انتهى الوقت!** الإجابة الصحيحة كانت: **${item.options[item.correct]}**`,
        components: []
      }).catch(() => {});
    }
  });
}

async function runFastType(interaction) {
  const word = FAST_WORDS[Math.floor(Math.random() * FAST_WORDS.length)];

  const embed = new EmbedBuilder()
    .setColor('#9333ea')
    .setTitle('⚡ أسرع كتابة | Fast Type')
    .setDescription(`اكتب الكلمة التالية في الشات بأسرع ما يمكنك خلال 15 ثانية:\n\n# \`${word}\``)
    .setFooter({ text: 'أول شخص يكتبها بشكل صحيح سيفوز!' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const startTime = Date.now();
  const filter = m => m.content.trim() === word && !m.author.bot;
  const channel = interaction.channel;

  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });
    const winnerMsg = collected.first();
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);

    const winEmbed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('🎉 فائز في أسرع كتابة!')
      .setDescription(`👑 **الفائز:** ${winnerMsg.author}\n⏱️ **الوقت المستغرق:** \`${timeTaken} ثانية\`\n📝 **الكلمة:** \`${word}\``)
      .setTimestamp();

    await channel.send({ embeds: [winEmbed] });
  } catch(e) {
    await channel.send(`⏰ **انتهى الوقت!** لم يقم أحد بكتابة الكلمة \`${word}\` بالوقت المحدد.`);
  }
}
