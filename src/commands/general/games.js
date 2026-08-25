// ============================================================
// FILE: src/commands/general/games.js
// ألعاب وتسلية تفاعلية شاملة (لوحة أزرار وألعاب ذكاء وتحديات تفاعلية بالصور والجوائز)
// ============================================================
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');

const TRIVIA_QUESTIONS = [
  { q: "ما هي عاصمة أستراليا؟", options: ["سيدني", "كانبيرا", "ملبورن", "بيرث"], correct: 1 },
  { q: "كم عدد سور القرآن الكريم؟", options: ["110", "112", "114", "116"], correct: 2 },
  { q: "ما هو أكبر كوكب في المجموعة الشمسية؟", options: ["المشتري", "زحل", "الأرض", "نبتون"], correct: 0 },
  { q: "ما هو أسرع حيوان بري في العالم؟", options: ["الأسد", "الفهد الصياد", "الغزال", "الحصان"], correct: 1 },
  { q: "ما هو العنصر الكيميائي الذي رمزه O؟", options: ["الذهب", "الحديد", "الأكسجين", "الفضة"], correct: 2 },
  { q: "في أي قارة تقع دولة البرازيل؟", options: ["آسيا", "أفريقيا", "أمريكا الجنوبية", "أوروبا"], correct: 2 },
  { q: "ما هي أطول آية في القرآن الكريم؟", options: ["آية الكرسي", "آية الدين", "آية النور", "آية الملك"], correct: 1 },
  { q: "ما هي عاصمة اليابان؟", options: ["كيوتو", "طوكيو", "أوساكا", "هيروشيما"], correct: 1 },
  { q: "من هو مخترع المصباح الكهربائي؟", options: ["توماس إديسون", "نيكولا تسلا", "ألكسندر بيل", "آينشتاين"], correct: 0 },
  { q: "ما هي أكبر صحراء حارة في العالم؟", options: ["صحراء غوبي", "الصحراء الكبرى", "صحراء كالاهاري", "الربع الخالي"], correct: 1 },
  { q: "كم عدد عظام جسم الإنسان البالغ؟", options: ["206", "214", "198", "250"], correct: 0 },
  { q: "ما هي عملة دولة اليابان؟", options: ["اليوان", "الوون", "الين", "الدولار"], correct: 2 },
  { q: "ما هو أطول نهر في العالم؟", options: ["نهر الأمازون", "نهر النيل", "نهر المسيسيبي", "نهر الدانوب"], correct: 1 },
  { q: "في أي عام هبط الإنسان على سطح القمر لأول مرة؟", options: ["1965", "1969", "1972", "1959"], correct: 1 }
];

const FAST_WORDS = [
  "القسطنطينية", "الاستقلال", "التكنولوجيا", "الذكاء الاصطناعي", "المملكة العربية السعودية",
  "إمبراطورية", "ديسكورد زينو", "برمجة المستقبل", "الاستراتيجية", "الجمهورية",
  "الأوتوقراطية", "اللوجستيات", "الإلكترونيات", "الكهرومغناطيسية", "البطليموس",
  "الميكانيكا", "الأوراكل", "السيمفونية", "الأنثروبولوجيا", "الأيديولوجيا"
];

// دالة مساعدة لتطبيع النص العربي والمقارنة المرنة
function normalizeText(text) {
  if (!text) return '';
  return text.toString()
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة الحركات والتشكيل
    .replace(/[أإآٱ]/g, 'ا')              // توحيد الألف
    .replace(/[ة]/g, 'ه')                 // توحيد التاء المربوطة
    .replace(/[ى]/g, 'ي')                 // توحيد الياء
    .replace(/[ـ_]/g, ' ')                // إزالة التطويل والشرطات
    .replace(/\s+/g, ' ');                // توحيد المسافات
}

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
      sub.setName('trivia').setDescription('لعبة سؤال وجواب مع خيارات تفاعلية وجوائز')
    )
    .addSubcommand(sub =>
      sub.setName('fast').setDescription('لعبة أسرع كتابة كلمة مع بطاقة مصممة')
    )
    .addSubcommand(sub =>
      sub.setName('rps').setDescription('لعبة حجر ورقة مقص ضد البوت مع خيارات فورية')
        .addStringOption(opt =>
          opt.setName('choice').setDescription('اختر حركتك (اختياري، إن لم تختر ستظهر لك أزرار)')
            .setRequired(false)
            .addChoices(
              { name: '🪨 حجر (Rock)', value: 'rock' },
              { name: '📄 ورقة (Paper)', value: 'paper' },
              { name: '✂️ مقص (Scissors)', value: 'scissors' }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options?.getSubcommand ? interaction.options.getSubcommand() : 'panel';

    if (sub === 'panel') {
      const embed = new EmbedBuilder()
        .setColor('#9333ea')
        .setTitle('🎮 مركز الألعاب والتسلية الشامل | ZENO Games')
        .setDescription(
          `**اختر اللعبة من الأزرار التفاعلية أدناه وتنافس لجمع نقاط وعملات النجوم ⭐!**\n\n` +
          `🎯 **الألعاب الفردية والسريعة:**\n` +
          `• ❓ **سؤال وجواب (Trivia):** 4 خيارات تفاعلية مع كشف الإجابة فوراً\n` +
          `• ⚡ **أسرع كتابة (Fast Type):** بطاقة مصورة وتحدي سرعة في الشات\n` +
          `• ✂️ **حجر ورقة مقص (RPS):** تحدَّ البوت بأزرار تفاعلية فورية\n` +
          `• 🎲 **رمي النرد (Dice):** ارمِ النرد واربح جوائز حظ مضاعفة\n` +
          `• 🪙 **رمي العملة (Coinflip):** اختر (ملك 👑 أو كتابة 🦅) وضاعف نقاطك\n\n` +
          `👥 **الألعاب الجماعية والتحديات:**\n` +
          `• 🎰 **روليت الحظ:** غرفة تفاعلية ومواجهة حماسية\n` +
          `• ⚔️ **قتال التحدي:** راهن وتحدَّ أي عضو في السيرفر\n` +
          `• 🔫 **مافيا الغموض:** أدوار سرية وخداع مع أصدقائك\n` +
          `• 🪑 **كراسي موسيقية:** سرعة بديهة واستبعاد حتى الفائز الأخير\n` +
          `• 🙈 **لعبة الغميضة:** اختبئ وابحث عن الآخرين`
        )
        .addFields(
          { name: '🏆 الجوائز', value: 'الفائزون يحصلون على عملات نقدية تضاف لمحفظتهم فوراً!', inline: true },
          { name: '⚡ الاستجابة', value: 'أزرار حية وتفاعل فوري بدون تأخير', inline: true }
        )
        .setFooter({ text: 'ZENO Games • العب واستمتع مع أصدقائك بالسيرفر', iconURL: interaction.guild?.iconURL() || undefined })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('game_btn_trivia').setLabel('سؤال وجواب ❓').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('game_btn_fast').setLabel('أسرع كتابة ⚡').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('game_btn_rps').setLabel('حجر ورقة مقص ✂️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('game_btn_dice').setLabel('رمي النرد 🎲').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('game_btn_coin').setLabel('رمي العملة 🪙').setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('game_btn_roulette').setLabel('روليت 🎰').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('game_btn_fight').setLabel('قتال ⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('game_btn_mafia').setLabel('مافيا 🔫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('game_btn_chairs').setLabel('كراسي 🪑').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('game_btn_hideseek').setLabel('غميضة 🙈').setStyle(ButtonStyle.Primary)
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
      const userChoice = interaction.options?.getString ? interaction.options.getString('choice') : null;
      if (userChoice) {
        return handleRpsResult(interaction, userChoice);
      } else {
        return startInteractiveRps(interaction);
      }
    }
  }
};

// ==========================================
// 1. لعبة سؤال وجواب (Trivia Interactive)
// ==========================================
async function runTrivia(interaction) {
  const item = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
  const reward = Math.floor(Math.random() * 50) + 30; // 30 - 80 coins

  let cardBuffer = null;
  try {
    if (canvasUtil.createTriviaCard) {
      cardBuffer = await canvasUtil.createTriviaCard(item.q, 20);
    }
  } catch(e) {}

  const embed = new EmbedBuilder()
    .setColor('#9333ea')
    .setTitle('❓ سؤال وجواب | Trivia Quiz')
    .setDescription(
      `### 💡 ${item.q}\n\n` +
      `اختر الإجابة الصحيحة بالضغط على الزر المناسب أدناه خلال **20 ثانية**:\n` +
      `🎁 **مكافأة الإجابة الصحيحة:** \`+${reward} ⭐ Star Coins\``
    )
    .setFooter({ text: 'لديك 20 ثانية للإجابة | اضغط زر الإجابة الصحيحة' })
    .setTimestamp();

  const files = [];
  if (cardBuffer) {
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'trivia.png' });
    embed.setImage('attachment://trivia.png');
    files.push(attachment);
  }

  const buttons = item.options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`trivia_ans_${i}`)
      .setLabel(`${i + 1}. ${opt}`)
      .setStyle(ButtonStyle.Primary)
  );

  const row = new ActionRowBuilder().addComponents(buttons);
  const replyMsg = await interaction.reply({ embeds: [embed], components: [row], files, fetchReply: true });

  const collector = replyMsg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 20000,
    max: 1
  });

  collector.on('collect', async i => {
    const selected = parseInt(i.customId.replace('trivia_ans_', ''));
    const isCorrect = selected === item.correct;

    if (isCorrect && interaction.guild) {
      try { db.addCoins(i.user.id, interaction.guild.id, reward); } catch(e) {}
    }

    const disabledButtons = item.options.map((opt, idx) => {
      const btn = new ButtonBuilder()
        .setCustomId(`trivia_done_${idx}`)
        .setLabel(`${idx + 1}. ${opt}`)
        .setDisabled(true);

      if (idx === item.correct) {
        btn.setStyle(ButtonStyle.Success);
      } else if (idx === selected && !isCorrect) {
        btn.setStyle(ButtonStyle.Danger);
      } else {
        btn.setStyle(ButtonStyle.Secondary);
      }
      return btn;
    });

    const resultRow = new ActionRowBuilder().addComponents(disabledButtons);

    const resultEmbed = new EmbedBuilder()
      .setColor(isCorrect ? '#10b981' : '#ef4444')
      .setTitle(isCorrect ? '🎉 إجابة صحيحة وممتازة!' : '❌ للأسف، إجابة خاطئة!')
      .setDescription(
        `**السؤال:** ${item.q}\n\n` +
        `👤 **إجابتك:** \`${item.options[selected]}\` ${isCorrect ? '✅' : '❌'}\n` +
        `✨ **الإجابة الصحيحة:** \`${item.options[item.correct]}\` 🎯\n\n` +
        (isCorrect ? `💰 **تمت إضافة المكافأة:** \`+${reward} ⭐\` إلى محفظتك!` : 'حظاً أوفر في الأسئلة القادمة!')
      )
      .setFooter({ text: i.user.username, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    await i.update({ embeds: [resultEmbed], components: [resultRow] });
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const timeoutButtons = item.options.map((opt, idx) =>
        new ButtonBuilder()
          .setCustomId(`trivia_timeout_${idx}`)
          .setLabel(`${idx + 1}. ${opt}`)
          .setStyle(idx === item.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('⏰ انتهى وقت الإجابة!')
            .setDescription(`**السؤال:** ${item.q}\n\n🎯 **الإجابة الصحيحة كانت:** \`${item.options[item.correct]}\``)
            .setTimestamp()
        ],
        components: [new ActionRowBuilder().addComponents(timeoutButtons)]
      }).catch(() => {});
    }
  });
}

// ==========================================
// 2. لعبة أسرع كتابة (Fast Type with Canvas & Live Reactions)
// ==========================================
async function runFastType(interaction) {
  const word = FAST_WORDS[Math.floor(Math.random() * FAST_WORDS.length)];
  const reward = Math.floor(Math.random() * 60) + 50; // 50 - 110 coins

  let cardBuffer = null;
  try {
    if (canvasUtil.createFastTypeCard) {
      cardBuffer = await canvasUtil.createFastTypeCard(word, 20);
    }
  } catch(e) {}

  const embed = new EmbedBuilder()
    .setColor('#9333ea')
    .setTitle('⚡ تحدي أسرع كتابة | Fast Type Challenge')
    .setDescription(
      `اكتب الكلمة التالية في الشات بأسرع ما يمكنك خلال **20 ثانية**:\n\n` +
      `# 📝 \`${word}\`\n\n` +
      `🎁 **جائزة الفائز:** \`+${reward} ⭐ Star Coins\`\n` +
      `💡 *البوت يتفاعل فورياً مع كل محاولة (صحيحة ✅ أو خاطئة ❌)!*`
    )
    .setFooter({ text: 'أول شخص يكتب الكلمة بدقة في الشات يفوز!' })
    .setTimestamp();

  const files = [];
  if (cardBuffer) {
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'fasttype.png' });
    embed.setImage('attachment://fasttype.png');
    files.push(attachment);
  }

  await interaction.reply({ embeds: [embed], files });

  const client = interaction.client;
  const channelId = interaction.channelId;
  const targetNormalized = normalizeText(word);
  const startTime = Date.now();

  let isFinished = false;

  const onMessage = async (msg) => {
    if (isFinished) return;
    if (msg.channelId !== channelId || msg.author.bot) return;

    const userTextNormalized = normalizeText(msg.content);

    // فحص التطابق أو الاحتواء
    const isExactMatch = userTextNormalized === targetNormalized;
    const isContained = userTextNormalized.includes(targetNormalized) && userTextNormalized.length <= targetNormalized.length + 4;

    if (isExactMatch || isContained) {
      isFinished = true;
      client.removeListener('messageCreate', onMessage);
      clearTimeout(timer);

      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);

      // تفاعل فوري بالرياكشن
      msg.react('🎉').catch(() => {});
      msg.react('⚡').catch(() => {});

      // إضافة المكافأة والنقاط
      if (interaction.guild && msg.author) {
        try {
          db.addCoins(msg.author.id, interaction.guild.id, reward);
          if (db.addXp) db.addXp(msg.author.id, interaction.guild.id, 25);
        } catch(e) {}
      }

      const winEmbed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('🏆 فائز بطل في تحدي أسرع كتابة!')
        .setDescription(
          `👑 **الفائز:** <@${msg.author.id}> (${msg.author.username})\n` +
          `⏱️ **الوقت القياسي:** \`${timeTaken} ثانية\` ⚡\n` +
          `📝 **الكلمة المطلوبة:** \`${word}\`\n` +
          `💰 **المكافأة:** \`+${reward} ⭐ Star Coins\` تمت إضافتها لمحفظتك فوراً!`
        )
        .setThumbnail(msg.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'تهانينا! سرعة استجابة مذهلة 👏' })
        .setTimestamp();

      return msg.reply({ embeds: [winEmbed] }).catch(() => {
        interaction.channel.send({ embeds: [winEmbed] }).catch(() => {});
      });
    } else {
      // تفاعل مع المحاولات الخاطئة
      if (msg.content.trim().length >= 2) {
        msg.react('❌').catch(() => {});
      }
    }
  };

  client.on('messageCreate', onMessage);

  const timer = setTimeout(async () => {
    if (isFinished) return;
    isFinished = true;
    client.removeListener('messageCreate', onMessage);

    const timeoutEmbed = new EmbedBuilder()
      .setColor('#ef4444')
      .setTitle('⏰ انتهى الوقت!')
      .setDescription(`لم يقم أحد بكتابة الكلمة الصحيحة \`${word}\` في الوقت المحدد (20 ثانية).`)
      .setTimestamp();

    await interaction.channel.send({ embeds: [timeoutEmbed] }).catch(() => {});
  }, 20000);
}

// ==========================================
// 3. لعبة حجر ورقة مقص التفاعلية (Interactive RPS)
// ==========================================
async function startInteractiveRps(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#9333ea')
    .setTitle('✂️ حجر - ورقة - مقص التفاعلية | RPS')
    .setDescription('اختر حركتك عبر الضغط على أحد الأزرار التفاعلية أدناه:')
    .setFooter({ text: 'لديك 20 ثانية لاختيار حركتك' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rps_play_rock').setLabel('حجر 🪨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps_play_paper').setLabel('ورقة 📄').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rps_play_scissors').setLabel('مقص ✂️').setStyle(ButtonStyle.Danger)
  );

  const replyMsg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  const collector = replyMsg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 20000,
    max: 1
  });

  collector.on('collect', async i => {
    const userChoice = i.customId.replace('rps_play_', '');
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    const choiceNames = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };

    let result = '';
    let color = '#9333ea';
    let reward = 0;

    if (userChoice === botChoice) {
      result = '🤝 **تعادل!** كلاهما اختار نفس الحركة.';
      color = '#eab308';
    } else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) {
      reward = 25;
      result = `🎉 **مبروك، لقد فزت على البوت بجدارة!** 🏆\n💰 **مكافأة الفوز:** \`+${reward} ⭐ Star Coins\``;
      color = '#10b981';
      if (interaction.guild) {
        try { db.addCoins(i.user.id, interaction.guild.id, reward); } catch(e) {}
      }
    } else {
      result = '🤖 **البوت فاز عليك هذه الجولة!** حظاً أوفر في المرة القادمة.';
      color = '#ef4444';
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle('✂️ نتيجة جولة حجر - ورقة - مقص')
      .setDescription(`👤 **اختيارك:** ${choiceNames[userChoice]}\n🤖 **اختيار البوت:** ${choiceNames[botChoice]}\n\n${result}`)
      .setFooter({ text: i.user.username, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    await i.update({ embeds: [resultEmbed], components: [] });
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      await interaction.editReply({ content: '⏰ انتهى الوقت لاختيار حركتك.', components: [] }).catch(() => {});
    }
  });
}

function handleRpsResult(interaction, userChoice) {
  const choices = ['rock', 'paper', 'scissors'];
  const botChoice = choices[Math.floor(Math.random() * choices.length)];
  const choiceNames = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };

  let result = '';
  let color = '#9333ea';
  let reward = 0;

  if (userChoice === botChoice) {
    result = '🤝 **تعادل!** كلاهما اختار نفس الحركة.';
    color = '#eab308';
  } else if (
    (userChoice === 'rock' && botChoice === 'scissors') ||
    (userChoice === 'paper' && botChoice === 'rock') ||
    (userChoice === 'scissors' && botChoice === 'paper')
  ) {
    reward = 25;
    result = `🎉 **مبروك، لقد فزت على البوت!** 🏆\n💰 **المكافأة:** \`+${reward} ⭐ Star Coins\``;
    color = '#10b981';
    if (interaction.guild) {
      try { db.addCoins(interaction.user.id, interaction.guild.id, reward); } catch(e) {}
    }
  } else {
    result = '🤖 **البوت فاز عليك هذه الجولة!** حظاً أوفر.';
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

