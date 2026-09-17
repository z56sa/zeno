const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-autoline-line',
  description: 'تحديد خط للروم',
  aliases: ['تحديد-الخط'],
  data: new SlashCommandBuilder()
    .setName('set-autoline-line')
    .setDescription('تحديد خط للروم')
    .addStringOption(opt => opt.setName('line').setDescription('رابط الخط').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'autoline_line', line);
    return interaction.reply({ content: '✅ تم تعيين رابط الخط بنجاح!' });
  }
};
