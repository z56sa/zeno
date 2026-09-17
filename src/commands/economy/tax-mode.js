const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'tax-mode',
  description: 'تحديد نمط الضريبة',
  aliases: ['نمط-الضريبة'],
  data: new SlashCommandBuilder()
    .setName('tax-mode')
    .setDescription('تحديد نمط الضريبة')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('النمط')
        .setRequired(true)
        .addChoices(
          { name: 'شامل التفاصيل', value: 'all' },
          { name: 'رقم فقط', value: 'compact' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'tax_mode', mode);
    return interaction.reply({ content: '✅ تم تعيين نمط الضريبة إلى: ' + mode });
  }
};
