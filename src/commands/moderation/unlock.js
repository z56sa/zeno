const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unlock',
  description: 'فتح الروم الحالي للسماح للأعضاء بالكتابة',
  aliases: ['فتح'],
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('فتح الروم الحالي')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة القنوات.', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null
    });

    await interaction.reply({ content: '🔓 **تم فتح هذا الروم بنجاح.**' });
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ لا تملك صلاحية إدارة القنوات.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: null
    });

    await message.channel.send('🔓 **تم فتح هذا الروم بنجاح.**');
  }
};
