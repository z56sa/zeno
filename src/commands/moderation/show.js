const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'show',
  description: 'إظهار الروم الحالي للأعضاء',
  aliases: ['اظهار', 'شو'],
  data: new SlashCommandBuilder()
    .setName('show')
    .setDescription('إظهار الروم الحالي للأعضاء')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة القنوات.', flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      ViewChannel: null
    });

    await interaction.editReply('👁️✅ **تم إظهار هذا الروم للأعضاء بنجاح.**');
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ لا تملك صلاحية إدارة القنوات.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      ViewChannel: null
    });

    await message.channel.send('👁️✅ **تم إظهار هذا الروم للأعضاء بنجاح.**');
  }
};