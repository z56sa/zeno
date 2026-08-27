const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'lock',
  description: 'قفل الروم الحالي لمنع الأعضاء من الكتابة',
  aliases: ['قفل'],
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('قفل الروم الحالي')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة القنوات.', flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false
    });

    await interaction.editReply({ content: '🔒 **تم قفل هذا الروم بنجاح.**' });
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ لا تملك صلاحية إدارة القنوات.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false
    });

    await message.channel.send('🔒 **تم قفل هذا الروم بنجاح.**');
  }
};