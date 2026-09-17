const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-tax-line',
  description: 'تحديد خط لروم الضريبة',
  aliases: ['خط-الضريبة'],
  data: new SlashCommandBuilder()
    .setName('set-tax-line')
    .setDescription('تحديد خط لروم الضريبة')
    .addStringOption(opt => opt.setName('line').setDescription('رابط الخط').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'tax_line', line);
    return interaction.reply({ content: '✅ تم تعيين خط الضريبة بنجاح!' });
  }
};
