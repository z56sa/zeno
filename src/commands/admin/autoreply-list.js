const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'autoreply-list',
  description: 'لرؤية جميع الردود التلقائية',
  aliases: ['قائمة-الردود'],
  data: new SlashCommandBuilder()
    .setName('autoreply-list')
    .setDescription('لرؤية جميع الردود التلقائية')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const list = db.getAutoResponders(interaction.guild.id);
    if (!list || list.length === 0) return interaction.reply({ content: '❌ لا توجد ردود تلقائية مضافة.', flags: 64 });
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('💬 قائمة الردود التلقائية (' + list.length + ')')
      .setDescription(list.map(r => '#' + r.id + ' [' + r.trigger_word + '] -> ' + r.reply_text).join('\n'));
    return interaction.reply({ embeds: [embed] });
  }
};
