const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unhide',
  description: 'إظهار الروم الحالي وإلغاء إخفائه عن الأعضاء',
  aliases: ['انهايد', 'الغاء-الاخفاء'],
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('إظهار الروم الحالي وإلغاء إخفائه عن الأعضاء')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة القنوات.', flags: 64 });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ البوت لا يملك صلاحية إدارة القنوات (Manage Channels) لتنفيذ هذا الإجراء.', flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        ViewChannel: null
      });
      await interaction.editReply('👁️✅ **تم إظهار هذا الروم للأعضاء بنجاح.**');
    } catch (err) {
      await interaction.editReply({ content: '❌ تعذر إظهار الروم. تأكد من صلاحيات البوت ورتبته.' }).catch(() => {});
    }
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ لا تملك صلاحية إدارة القنوات.');
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ البوت لا يملك صلاحية إدارة القنوات (Manage Channels) لتنفيذ هذا الإجراء.');
    }

    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        ViewChannel: null
      });
      await message.channel.send('👁️✅ **تم إظهار هذا الروم للأعضاء بنجاح.**');
    } catch (err) {
      await message.reply('❌ تعذر إظهار الروم. تأكد من صلاحيات البوت ورتبته.');
    }
  }
};
