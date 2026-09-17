const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'add-autoline-channel',
  description: 'اضافة روم خط تلقائي',
  aliases: ['اضافة-خط'],
  data: new SlashCommandBuilder()
    .setName('add-autoline-channel')
    .setDescription('اضافة روم خط تلقائي')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    const settings = db.getGuildSettings(interaction.guild.id);
    let channels = [];
    try { channels = JSON.parse(settings.autoline_channels || '[]'); } catch(e) {}
    if (channels.includes(channel.id)) return interaction.reply({ content: '⚠️ الروم مضاف مسبقاً.', flags: 64 });
    channels.push(channel.id);
    db.updateGuildSetting(interaction.guild.id, 'autoline_channels', JSON.stringify(channels));
    return interaction.reply({ content: '✅ تمت إضافة الروم إلى الخط التلقائي بنجاح!' });
  }
};
