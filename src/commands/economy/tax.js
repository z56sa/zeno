const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'tax',
  description: 'حساب ضريبة بروبوت',
  aliases: ['ضريبة'],
  data: new SlashCommandBuilder()
    .setName('tax')
    .setDescription('حساب ضريبة بروبوت')
    .addIntegerOption(opt => opt.setName('amount').setDescription('المبلغ').setMinValue(1).setRequired(true)),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const taxed = Math.floor((amount * 20) / 19) + 1;
    const diff = taxed - amount;
    const withMed = Math.floor((taxed * 20) / 19) + 1;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('💳 حاسبة ضريبة بروبوت')
      .addFields(
        { name: 'المبلغ الأصلي', value: amount.toLocaleString(), inline: true },
        { name: 'المبلغ المطلوب تحويله', value: taxed.toLocaleString(), inline: true },
        { name: 'الضريبة المستقطعة', value: diff.toLocaleString(), inline: true },
        { name: 'مع وسيط', value: withMed.toLocaleString(), inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }
};
