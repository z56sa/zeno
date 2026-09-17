const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'add-nadeko-room',
  description: 'اضافة روم يتم تفعيل الخاصية فيها',
  aliases: ['اضافة-روم-ناديكو'],
  data: new SlashCommandBuilder()
    .setName('add-nadeko-room')
    .setDescription('اضافة روم لتفعيل خاصية ناديكو')
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
    if (channels.includes(ch.id)) return interaction.reply({ content: '⚠️ الروم مضاف مسبقاً.', flags: 64 });
    channels.push(ch.id);
    db.updateGuildSetting(interaction.guild.id, 'nadeko_channels', JSON.stringify(channels));
    return interaction.reply({ content: '✅ تمت إضافة الروم بنجاح!' });
  }
};
