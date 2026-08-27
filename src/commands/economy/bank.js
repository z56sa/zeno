const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'bank',
  description: 'نظام البنك - أودع وانسحب بأمان',
  aliases: ['بنك'],
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('نظام البنك 🏦')
    .addSubcommand(sub => sub.setName('balance').setDescription('عرض رصيد المحفظة والبنك'))
    .addSubcommand(sub => sub.setName('deposit').setDescription('إيداع في البنك')
      .addStringOption(opt => opt.setName('amount').setDescription('المبلغ أو "all"').setRequired(true)))
    .addSubcommand(sub => sub.setName('withdraw').setDescription('سحب من البنك')
      .addStringOption(opt => opt.setName('amount').setDescription('المبلغ أو "all"').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleBank(interaction.user, interaction.guild.id, interaction.options.getSubcommand(),
      interaction.options.getString('amount'), (opts) => interaction.editReply(opts));
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() || 'balance';
    const amount = args[1];
    await this.handleBank(message.author, message.guild.id, sub, amount, (opts) => message.reply(opts));
  },

  async handleBank(user, guildId, sub, amountArg, reply) {
    // تأكد أن عمود bank_balance موجود
    try {
      db.db.prepare('ALTER TABLE users ADD COLUMN bank_balance INTEGER DEFAULT 0').run();
    } catch (e) {}

    const userData = db.getUser(user.id, guildId);
    const wallet = userData.coins || userData.credits || 0;
    const bank = userData.bank_balance || 0;

    if (sub === 'balance') {
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`🏦 حساب ${user.username} البنكي`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👛 المحفظة', value: `\`${wallet.toLocaleString()}\` ⭐`, inline: true },
          { name: '🏦 البنك', value: `\`${bank.toLocaleString()}\` ⭐`, inline: true },
          { name: '💎 الإجمالي', value: `\`${(wallet + bank).toLocaleString()}\` ⭐`, inline: true }
        )
        .setFooter({ text: 'المال في البنك آمن من الخسارة في المراهنات!' })
        .setTimestamp();
      return reply({ embeds: [embed] });
    }

    const isAll = amountArg?.toLowerCase() === 'all';
    const amount = isAll ? (sub === 'deposit' ? wallet : bank) : parseInt(amountArg);

    if (isNaN(amount) || amount <= 0)
      return reply({ content: '❌ أدخل مبلغاً صحيحاً أو اكتب `all`.', flags: 64 });

    if (sub === 'deposit') {
      if (wallet < amount) return reply({ content: `❌ ليس في محفظتك كافٍ! لديك \`${wallet.toLocaleString()}\` ⭐`, flags: 64 });
      db.removeCoins(user.id, guildId, amount);
      db.db.prepare('UPDATE users SET bank_balance = bank_balance + ? WHERE user_id = ? AND guild_id = ?').run(amount, user.id, guildId);
      const embed = new EmbedBuilder().setColor('#27ae60')
        .setTitle('✅ تم الإيداع في البنك')
        .addFields(
          { name: '💰 تم إيداع', value: `\`${amount.toLocaleString()}\` ⭐`, inline: true },
          { name: '👛 المحفظة', value: `\`${(wallet - amount).toLocaleString()}\` ⭐`, inline: true },
          { name: '🏦 البنك', value: `\`${(bank + amount).toLocaleString()}\` ⭐`, inline: true }
        ).setTimestamp();
      return reply({ embeds: [embed] });

    } else if (sub === 'withdraw') {
      if (bank < amount) return reply({ content: `❌ ليس في بنكك كافٍ! لديك \`${bank.toLocaleString()}\` ⭐ في البنك.`, flags: 64 });
      db.db.prepare('UPDATE users SET bank_balance = bank_balance - ? WHERE user_id = ? AND guild_id = ?').run(amount, user.id, guildId);
      db.addCoins(user.id, guildId, amount);
      const embed = new EmbedBuilder().setColor('#e67e22')
        .setTitle('✅ تم السحب من البنك')
        .addFields(
          { name: '💰 تم سحب', value: `\`${amount.toLocaleString()}\` ⭐`, inline: true },
          { name: '👛 المحفظة', value: `\`${(wallet + amount).toLocaleString()}\` ⭐`, inline: true },
          { name: '🏦 البنك', value: `\`${(bank - amount).toLocaleString()}\` ⭐`, inline: true }
        ).setTimestamp();
      return reply({ embeds: [embed] });
    }
  }
};
