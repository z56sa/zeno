const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');

const COOLDOWNS = new Map();

module.exports = {
  name: 'coinflip',
  description: 'ارمِ العملة - العب ضد البوت أو تحدّ شخصاً! 🪙',
  aliases: ['عملة', 'قلب'],
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('ارمِ العملة وراهن بـ Star Coin ⭐ 🪙')
    .addStringOption(opt =>
      opt.setName('choice')
        .setDescription('وجه العملة')
        .setRequired(true)
        .addChoices(
          { name: '👑 وجه (Heads)', value: 'heads' },
          { name: '🦅 ذيل (Tails)', value: 'tails' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('مبلغ الرهان (الحد الأدنى 10)')
        .setRequired(true)
        .setMinValue(10)
    )
    .addUserOption(opt =>
      opt.setName('opponent')
        .setDescription('تحدّ شخصاً آخر (اختياري - إذا لم تختر سيكون البوت خصمك)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const choice = interaction.options.getString('choice');
    const bet = interaction.options.getInteger('bet');
    const opponent = interaction.options.getUser('opponent');

    // كولداون 5 ثوانٍ
    const now = Date.now();
    const lastUsed = COOLDOWNS.get(interaction.user.id) || 0;
    if (now - lastUsed < 5000) {
      const remaining = Math.ceil((5000 - (now - lastUsed)) / 1000);
      return interaction.reply({ content: `⏳ انتظر **${remaining}** ثانية قبل الرمي مجدداً!`, flags: 64 });
    }

    // تحقق من الرصيد
    const userData = db.getUser(interaction.user.id, interaction.guild.id);
    const balance = userData.coins || 0;
    if (balance < bet) {
      return interaction.reply({ content: `❌ رصيدك غير كافٍ! لديك \`${balance.toLocaleString()}\` ⭐`, flags: 64 });
    }

    // إذا كان هناك خصم بشري
    if (opponent) {
      if (opponent.id === interaction.user.id) {
        return interaction.reply({ content: '❌ لا تستطيع تحدي نفسك!', flags: 64 });
      }
      if (opponent.bot) {
        return interaction.reply({ content: '❌ لا يمكن تحدي البوت في وضع التحدي!', flags: 64 });
      }

      const oppData = db.getUser(opponent.id, interaction.guild.id);
      const oppBalance = oppData.coins || 0;
      if (oppBalance < bet) {
        return interaction.reply({ content: `❌ رصيد **${opponent.username}** غير كافٍ للمبارزة! لديه \`${oppBalance.toLocaleString()}\` ⭐`, flags: 64 });
      }

      // وجه الخصم هو عكس وجه المتحدي
      const oppChoice = choice === 'heads' ? 'tails' : 'heads';
      const choiceText = choice === 'heads' ? '👑 وجه' : '🦅 ذيل';
      const oppChoiceText = oppChoice === 'heads' ? '👑 وجه' : '🦅 ذيل';

      const challengeEmbed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🪙 تحدي رمي العملة!')
        .setDescription(
          `**${interaction.user.username}** يتحداك يا **${opponent.username}**!\n\n` +
          `🪙 **الرهان:** \`${bet.toLocaleString()}\` ⭐\n` +
          `👑 **${interaction.user.username}** يختار: ${choiceText}\n` +
          `🦅 **${opponent.username}** سيكون: ${oppChoiceText}\n\n` +
          `هل تقبل التحدي؟`
        )
        .setFooter({ text: 'لديك 30 ثانية للرد' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cf_accept').setLabel('✅ قبول التحدي').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cf_decline').setLabel('❌ رفض').setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({ content: `<@${opponent.id}>`, embeds: [challengeEmbed], components: [row], withResponse: true });

      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === opponent.id,
        componentType: ComponentType.Button,
        time: 30000,
        max: 1
      });

      collector.on('collect', async (btn) => {
        if (btn.customId === 'cf_decline') {
          return btn.update({
            content: '',
            embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ التحدي').setDescription(`**${opponent.username}** رفض التحدي!`)],
            components: []
          });
        }

        // قبل
        COOLDOWNS.set(interaction.user.id, Date.now());

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const challengerWon = choice === result;
        const resultText = result === 'heads' ? '👑 وجه' : '🦅 ذيل';

        const winner = challengerWon ? interaction.user : opponent;
        const loser = challengerWon ? opponent : interaction.user;

        db.addCoins(winner.id, interaction.guild.id, bet);
        db.removeCoins(loser.id, interaction.guild.id, bet);

        const resultEmbed = new EmbedBuilder()
          .setColor(challengerWon ? '#2ecc71' : '#e74c3c')
          .setTitle(`🪙 نتيجة رمي العملة!`)
          .setDescription(
            `🎲 **العملة أظهرت:** ${resultText}\n\n` +
            `🏆 **الفائز:** ${winner.username}\n` +
            `💔 **الخاسر:** ${loser.username}`
          )
          .addFields(
            { name: `💰 ${winner.username} ربح`, value: `\`+${bet.toLocaleString()}\` ⭐`, inline: true },
            { name: `💸 ${loser.username} خسر`, value: `\`-${bet.toLocaleString()}\` ⭐`, inline: true }
          )
          .setTimestamp();

        await btn.update({ content: '', embeds: [resultEmbed], components: [] });

        // رسالة خسارة للخاسر
        const lossEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('💀 خسرت الرهان!')
          .setDescription(
            `يا **${loser.username}**، العملة لم تكن في صفّك! 🪙\n\n` +
            `❌ **خسرت** \`${bet.toLocaleString()}\` ⭐ لصالح **${winner.username}**.\n\n` +
            `😅 الحظ مع **${winner.username}** هذه المرة!`
          )
          .setTimestamp();
        await btn.channel.send({ embeds: [lossEmbed] });
      });

      collector.on('end', (collected) => {
        if (collected.size === 0) {
          msg.edit({ content: '', embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('⏰ انتهى الوقت').setDescription(`**${opponent.username}** لم يرد على التحدي!`)], components: [] }).catch(() => {});
        }
      });

      return;
    }

    // اللعب ضد البوت
    COOLDOWNS.set(interaction.user.id, Date.now());
    await interaction.deferReply();

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = choice === result;

    if (won) db.addCoins(interaction.user.id, interaction.guild.id, bet);
    else db.removeCoins(interaction.user.id, interaction.guild.id, bet);

    const newBalance = won ? balance + bet : balance - bet;
    const choiceText = choice === 'heads' ? '👑 وجه' : '🦅 ذيل';
    const resultText = result === 'heads' ? '👑 وجه' : '🦅 ذيل';

    const embed = new EmbedBuilder()
      .setColor(won ? '#2ecc71' : '#e74c3c')
      .setTitle(`🪙 ${won ? 'فزت!' : 'خسرت!'}`)
      .setDescription(won ? '🎉 **حدسك صحيح!**' : '😔 **الحظ ليس معك هذه المرة**')
      .addFields(
        { name: '🤔 اختيارك', value: choiceText, inline: true },
        { name: '🪙 النتيجة', value: resultText, inline: true },
        { name: '💰 التغيير', value: won ? `\`+${bet.toLocaleString()}\` ⭐` : `\`-${bet.toLocaleString()}\` ⭐`, inline: true },
        { name: '💳 رصيدك', value: `\`${newBalance.toLocaleString()}\` ⭐`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const choice = args[0]?.toLowerCase();
    const bet = parseInt(args[1]);
    if (!['heads', 'tails', 'وجه', 'ذيل'].includes(choice) || isNaN(bet)) {
      return message.reply('❌ الاستخدام: `#coinflip heads/tails [رهان]`\nللتحدي مع شخص استخدم: `/coinflip`');
    }

    const now = Date.now();
    const lastUsed = COOLDOWNS.get(message.author.id) || 0;
    if (now - lastUsed < 5000) {
      const remaining = Math.ceil((5000 - (now - lastUsed)) / 1000);
      return message.reply(`⏳ انتظر **${remaining}** ثانية!`);
    }

    COOLDOWNS.set(message.author.id, Date.now());
    const normalizedChoice = ['heads', 'وجه'].includes(choice) ? 'heads' : 'tails';

    const userData = db.getUser(message.author.id, message.guild.id);
    const balance = userData.coins || 0;
    if (balance < bet) return message.reply(`❌ رصيدك غير كافٍ! لديك \`${balance.toLocaleString()}\` ⭐`);

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = normalizedChoice === result;

    if (won) db.addCoins(message.author.id, message.guild.id, bet);
    else db.removeCoins(message.author.id, message.guild.id, bet);

    const newBalance = won ? balance + bet : balance - bet;
    const choiceText = normalizedChoice === 'heads' ? '👑 وجه' : '🦅 ذيل';
    const resultText = result === 'heads' ? '👑 وجه' : '🦅 ذيل';

    const embed = new EmbedBuilder()
      .setColor(won ? '#2ecc71' : '#e74c3c')
      .setTitle(`🪙 ${won ? 'فزت!' : 'خسرت!'}`)
      .addFields(
        { name: '🤔 اختيارك', value: choiceText, inline: true },
        { name: '🪙 النتيجة', value: resultText, inline: true },
        { name: '💰 التغيير', value: won ? `\`+${bet.toLocaleString()}\` ⭐` : `\`-${bet.toLocaleString()}\` ⭐`, inline: true },
        { name: '💳 رصيدك', value: `\`${newBalance.toLocaleString()}\` ⭐`, inline: true }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
