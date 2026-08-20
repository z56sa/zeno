const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'coinflip',
  description: 'ارمِ العملة وراهن كريدتك 🪙',
  aliases: ['عملة', 'قلب'],
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('ارمِ العملة وراهن 🪙')
    .addStringOption(opt => opt.setName('choice').setDescription('وجه العملة').setRequired(true)
      .addChoices({ name: '👑 وجه (Heads)', value: 'heads' }, { name: '🦅 ذيل (Tails)', value: 'tails' }))
    .addIntegerOption(opt => opt.setName('bet').setDescription('مبلغ الرهان (الحد الأدنى 10)').setRequired(true).setMinValue(10)),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleFlip(interaction.user, interaction.guild.id,
      interaction.options.getString('choice'), interaction.options.getInteger('bet'),
      (opts) => interaction.editReply(opts));
  },

  async executePrefix(message, args) {
    const choice = args[0]?.toLowerCase();
    const bet = parseInt(args[1]);
    if (!['heads', 'tails', 'وجه', 'ذيل'].includes(choice) || isNaN(bet))
      return message.reply('❌ الاستخدام: `#coinflip heads/tails [رهان]`');
    const normalizedChoice = ['heads', 'وجه'].includes(choice) ? 'heads' : 'tails';
    await this.handleFlip(message.author, message.guild.id, normalizedChoice, bet, (opts) => message.reply(opts));
  },

  async handleFlip(user, guildId, choice, bet, reply) {
    const userData = db.getUser(user.id, guildId);
    const balance = userData.coins || userData.credits || 0;
    if (balance < bet) return reply({ content: `❌ رصيدك غير كافٍ! لديك \`${balance.toLocaleString()}\` ⭐`, ephemeral: true });

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = choice === result;

    if (won) db.addCoins(user.id, guildId, bet);
    else db.removeCoins(user.id, guildId, bet);

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

    await reply({ embeds: [embed] });
  }
};
