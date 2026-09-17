const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'add-info-button',
  description: 'إضافة زر برسالة محددة',
  aliases: ['زر-معلومات'],
  data: new SlashCommandBuilder()
    .setName('add-info-button')
    .setDescription('إضافة زر معلومات')
    .addStringOption(opt => opt.setName('message_id').setDescription('أيدي الرسالة').setRequired(true))
    .addStringOption(opt => opt.setName('label').setDescription('نص الزر').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const msgId = interaction.options.getString('message_id');
    const label = interaction.options.getString('label');
    const msg = await interaction.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return interaction.reply({ content: '❌ لم يتم العثور على الرسالة.', flags: 64 });
    const btn = new ButtonBuilder().setCustomId('info_' + Date.now()).setLabel(label).setStyle(ButtonStyle.Secondary);
    let rows = msg.components.map(r => ActionRowBuilder.from(r));
    if (rows.length === 0 || rows[rows.length - 1].components.length >= 5) {
      rows.push(new ActionRowBuilder().addComponents(btn));
    } else {
      rows[rows.length - 1].addComponents(btn);
    }
    await msg.edit({ components: rows });
    return interaction.reply({ content: '✅ تم إضافة زر المعلومات بنجاح!' });
  }
};
