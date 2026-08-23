const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-logs',
  description: 'تحديد روم سجلات السيرفر الشاملة (Audit Logs)',
  aliases: ['لوق', 'سجلات'],
  data: new SlashCommandBuilder()
    .setName('set-logs')
    .setDescription('تحديد روم السجلات الشاملة')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('روم السجلات')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'log_channel', channel.id);

    await interaction.reply({ content: `✅ تم تعيين روم السجلات بنجاح إلى: <#${channel.id}>` });
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ يرجى منشن الروم. مثال: `#set-logs #logs`');

    db.updateGuildSetting(message.guild.id, 'log_channel', channel.id);
    message.reply(`✅ تم تعيين روم السجلات بنجاح: <#${channel.id}>`);
  }
};
