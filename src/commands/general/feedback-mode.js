const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'feedback-mode',
  description: 'تحديد نمط الآراء',
  aliases: ['نمط-الاراء'],
  data: new SlashCommandBuilder()
    .setName('feedback-mode')
    .setDescription('تحديد نمط الآراء')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('النمط')
        .setRequired(true)
        .addChoices(
          { name: 'إيمبد', value: 'embed' },
          { name: 'عادي', value: 'normal' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'feedback_mode', mode);
    return interaction.reply({ content: '✅ تم تعيين نمط الآراء إلى: ' + mode });
  }
};
