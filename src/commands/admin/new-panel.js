const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'new-panel',
  description: 'انشاء بانل جديد',
  aliases: ['بانل-جديد'],
  data: new SlashCommandBuilder()
    .setName('new-panel')
    .setDescription('إنشاء بانل رتب جديد')
    .addStringOption(opt => opt.setName('title').setDescription('العنوان').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('الوصف').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const desc = interaction.options.getString('description');
    const embed = new EmbedBuilder().setColor('#5865F2').setTitle(title).setDescription(desc);
    const msg = await interaction.channel.send({ embeds: [embed] });
    return interaction.reply({ content: '✅ تم إنشاء البانل بنجاح! أيدي الرسالة: ' + msg.id });
  }
};
