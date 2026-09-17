const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'dm-mode',
  description: 'تفعيل او تعطيل ارسال نتائج التقديم بالخاص',
  aliases: ['وضع-الخاص'],
  data: new SlashCommandBuilder()
    .setName('dm-mode')
    .setDescription('إشعار التقديم بالخاص')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('تفعيل أو تعطيل').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'suggestions_dm_notify', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? '✅ تم تفعيل إشعارات الخاص.' : '❌ تم تعطيل إشعارات الخاص.' });
  }
};
