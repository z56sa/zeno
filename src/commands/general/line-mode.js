const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'line-mode',
  description: 'تحديد نمط الخط',
  aliases: ['نمط-الخط'],
  data: new SlashCommandBuilder()
    .setName('line-mode')
    .setDescription('تحديد نمط الخط')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('النمط')
        .setRequired(true)
        .addChoices(
          { name: 'رسالة عادية', value: 'line' },
          { name: 'إيمبد', value: 'embed' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'autoline_mode', mode);
    return interaction.reply({ content: '✅ تم تعيين نمط الخط إلى: ' + mode });
  }
};
