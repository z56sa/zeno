const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'suggestion-mode',
  description: 'تحديد نمط الاقتراحات',
  aliases: ['نمط-الاقتراحات'],
  data: new SlashCommandBuilder()
    .setName('suggestion-mode')
    .setDescription('تحديد نمط الاقتراحات')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('النمط')
        .setRequired(true)
        .addChoices(
          { name: 'إيمبد مع تصويت', value: 'embed' },
          { name: 'عادي', value: 'normal' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'suggestion_mode', mode);
    return interaction.reply({ content: '✅ تم تعيين نمط الاقتراحات إلى: ' + mode });
  }
};
