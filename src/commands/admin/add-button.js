const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'add-button',
  description: 'اضافة زر للرتبة أخرى',
  aliases: ['اضافة-زر'],
  data: new SlashCommandBuilder()
    .setName('add-button')
    .setDescription('إضافة زر رتبة لرسالة')
    .addStringOption(opt => opt.setName('message_id').setDescription('أيدي الرسالة').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true))
    .addStringOption(opt => opt.setName('label').setDescription('نص الزر').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const msgId = interaction.options.getString('message_id');
    const role = interaction.options.getRole('role');
    const label = interaction.options.getString('label');
    const msg = await interaction.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return interaction.reply({ content: '❌ لم يتم العثور على الرسالة في هذه القناة.', flags: 64 });
    const customId = 'rr_' + role.id + '_' + Date.now();
    const btn = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary);
    let rows = msg.components.map(r => ActionRowBuilder.from(r));
    if (rows.length === 0 || rows[rows.length - 1].components.length >= 5) {
      rows.push(new ActionRowBuilder().addComponents(btn));
    } else {
      rows[rows.length - 1].addComponents(btn);
    }
    await msg.edit({ components: rows });
    if (db.addReactionRole) db.addReactionRole(customId, interaction.guild.id, role.id, msg.id, msg.channel.id);
    return interaction.reply({ content: '✅ تم إضافة الزر للرسالة بنجاح!' });
  }
};
