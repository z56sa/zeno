const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'remove-nadeko-room',
  description: 'ازالة روم يتم تفعيل الخاصية فيها',
  aliases: ['ازالة-روم-ناديكو'],
  data: new SlashCommandBuilder()
    .setName('remove-nadeko-room')
    .setDescription('ازالة روم ناديكو')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const ch = interaction.options.getChannel('channel');
    const s = db.getGuildSettings(interaction.guild.id);
    let channels = [];
    try { channels = JSON.parse(s.nadeko_channels || '[]'); } catch(e) {}
    channels = channels.filter(id => id !== ch.id);
    db.updateGuildSetting(interaction.guild.id, 'nadeko_channels', JSON.stringify(channels));
    return interaction.reply({ content: '✅ تمت إزالة الروم بنجاح!' });
  }
};
