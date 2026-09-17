const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-feedback-line',
  description: 'تحديد خط لروم الآراء',
  aliases: ['خط-الاراء'],
  data: new SlashCommandBuilder()
    .setName('set-feedback-line')
    .setDescription('تحديد خط لروم الآراء')
    .addStringOption(opt => opt.setName('line').setDescription('رابط الخط').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'feedback_line', line);
    return interaction.reply({ content: '✅ تم تعيين خط الآراء بنجاح!' });
  }
};
