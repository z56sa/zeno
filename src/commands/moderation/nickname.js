const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'nickname',
  description: 'تغيير لقب شخص بالسيرفر او ازالته',
  aliases: ['لقب'],
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('تغيير لقب عضو')
    .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true))
    .addStringOption(opt => opt.setName('nick').setDescription('اللقب الجديد (فارغ للحذف)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة الألقاب.', flags: 64 });
    }
    const user = interaction.options.getUser('user');
    const nick = interaction.options.getString('nick') || null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ العضو غير موجود.', flags: 64 });
    await member.setNickname(nick);
    return interaction.reply({ content: nick ? '✅ تم تغيير اللقب بنجاح!' : '✅ تم مسح اللقب بنجاح!' });
  }
};
