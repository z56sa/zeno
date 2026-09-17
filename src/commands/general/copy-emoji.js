const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'copy-emoji',
  description: 'نسخ ايموجي من سيرفر اخر واضافته لسيرفرك',
  aliases: ['سرقة-ايموجي'],
  data: new SlashCommandBuilder()
    .setName('copy-emoji')
    .setDescription('نسخ إيموجي وإضافته للسيرفر')
    .addStringOption(opt => opt.setName('emoji').setDescription('الإيموجي').setRequired(true))
    .addStringOption(opt => opt.setName('name').setDescription('الاسم الجديد (اختياري)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة الإيموجيز.', flags: 64 });
    }
    const raw = interaction.options.getString('emoji');
    const name = interaction.options.getString('name');
    const match = raw.match(/<(a?):(\w+):(\d+)>/);
    if (!match) return interaction.reply({ content: '❌ إيموجي غير صالح.', flags: 64 });
    const url = 'https://cdn.discordapp.com/emojis/' + match[3] + (match[1] ? '.gif' : '.png');
    const created = await interaction.guild.emojis.create({ attachment: url, name: name || match[2] });
    return interaction.reply({ content: '✅ تم نسخ وإضافة الإيموجي بنجاح: ' + created.toString() });
  }
};
