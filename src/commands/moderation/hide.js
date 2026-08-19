const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'hide',
  description: 'إخفاء الروم الحالي عن الأعضاء العاديين',
  aliases: ['اخفاء', 'هايد'],
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('إخفاء الروم الحالي عن الأعضاء')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة القنوات.', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      ViewChannel: false
    });

    await interaction.reply('👁️❌ **تم إخفاء هذا الروم عن الأعضاء بنجاح.**');
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ لا تملك صلاحية إدارة القنوات.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      ViewChannel: false
    });

    await message.channel.send('👁️❌ **تم إخفاء هذا الروم عن الأعضاء بنجاح.**');
  }
};
