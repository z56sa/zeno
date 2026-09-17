const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'protection-status',
  description: 'عرض حالة جميع أنظمة الحماية في السيرفر',
  aliases: ['حالة-الحماية'],
  data: new SlashCommandBuilder()
    .setName('protection-status')
    .setDescription('عرض حالة أنظمة الحماية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const s = db.getGuildSettings(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🛡️ حالة أنظمة الحماية')
      .addFields(
        { name: 'Anti-Ban', value: s.antinuke_enabled ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: 'Anti-Bots', value: s.anti_bot ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: 'Anti-Delete-Roles', value: s.antinuke_enabled ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: 'Anti-Delete-Rooms', value: s.antinuke_enabled ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: 'Anti-Link', value: s.anti_link ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: 'Anti-Spam', value: s.anti_spam ? '🟢 مفعل' : '🔴 معطل', inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }
};
