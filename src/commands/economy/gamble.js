const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

const COOLDOWNS = new Map();
const GAMBLE_COOLDOWN = 10000; // 10 ثوانٍ

module.exports = {
  name: 'gamble',
  description: 'راهن كريدتك! 🎰',
  aliases: ['مراهنة', 'كازينو'],
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('راهن كريدتك في الكازينو 🎰')
    .addIntegerOption(opt => opt.setName('amount').setDescription('المبلغ (10 - 50000)').setRequired(true).setMinValue(10).setMaxValue(50000)),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleGamble(interaction.user, interaction.guild.id, interaction.options.getInteger('amount'),
      (opts) => interaction.editReply(opts));
  },

  async executePrefix(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount)) return message.reply('❌ الاستخدام: `#gamble [المبلغ]`');
    await this.handleGamble(message.author, message.guild.id, amount, (opts) => message.reply(opts));
  },

  async handleGamble(user, guildId, amount, reply) {
    // Cooldown
    const now = Date.now();
    const lastGamble = COOLDOWNS.get(user.id) || 0;
    if (now - lastGamble < GAMBLE_COOLDOWN) {
      const secs = Math.ceil((GAMBLE_COOLDOWN - (now - lastGamble)) / 1000);
      return reply({ content: `⏰ انتظر **${secs}** ثانية قبل المراهنة مجدداً.`, ephemeral: true });
    }

    const userData = db.getUser(user.id, guildId);
    const balance = userData.coins || userData.credits || 0;

    if (balance < amount)
      return reply({ content: `❌ رصيدك غير كافٍ! لديك فقط **${balance.toLocaleString()}** ⭐`, ephemeral: true });

    COOLDOWNS.set(user.id, now);

    // تحديد النتيجة
    const rand = Math.random() * 100;
    let result, multiplier, resultEmoji, resultText;

    if (rand < 10) {
      result = 'jackpot';
      multiplier = 5;
      resultEmoji = '🎰';
      resultText = '**JACKPOT!** 💥 ضربت الجائزة الكبرى!';
    } else if (rand < 55) {
      result = 'win';
      multiplier = 2;
      resultEmoji = '✅';
      resultText = '**فزت!** الحظ معك اليوم!';
    } else {
      result = 'lose';
      multiplier = 0;
      resultEmoji = '❌';
      resultText = '**خسرت!** حظاً أوفر في المرة القادمة!';
    }

    let newBalance;
    if (result === 'lose') {
      db.removeCoins(user.id, guildId, amount);
      newBalance = balance - amount;
    } else {
      const winAmount = amount * multiplier - amount; // الربح الصافي
      db.addCoins(user.id, guildId, winAmount);
      newBalance = balance + winAmount;
    }

    const changeAmount = result === 'lose' ? -amount : amount * multiplier - amount;
    const changeText = changeAmount >= 0 ? `+${changeAmount.toLocaleString()}` : changeAmount.toLocaleString();

    const colors = { jackpot: '#FFD700', win: '#2ecc71', lose: '#e74c3c' };
    const embed = new EmbedBuilder()
      .setColor(colors[result])
      .setTitle(`${resultEmoji} نتيجة المراهنة`)
      .setDescription(resultText)
      .addFields(
        { name: '💰 الرهان', value: `\`${amount.toLocaleString()}\` ⭐`, inline: true },
        { name: '📊 النتيجة', value: `\`${changeText}\` ⭐`, inline: true },
        { name: '💳 رصيدك', value: `\`${newBalance.toLocaleString()}\` ⭐`, inline: true }
      )
      .setFooter({ text: result === 'jackpot' ? '🎰 🎰 🎰 JACKPOT! 🎰 🎰 🎰' : 'كازينو ZENO — العب بمسؤولية!' })
      .setTimestamp();

    if (result === 'jackpot') embed.setDescription(`🎰🎰🎰\n${resultText}\n5x الرهان!`);

    await reply({ embeds: [embed] });
  }
};
