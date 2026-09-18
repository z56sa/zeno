const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'add-button',
  description: 'إضافة زر رتبة أو زر معلومات لرسالة محددة',
  aliases: ['اضافة-زر', 'زر-معلومات'],
  data: new SlashCommandBuilder()
    .setName('add-button')
    .setDescription('إضافة زر (رتبة أو معلومات) لرسالة محددة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('role')
        .setDescription('إضافة زر رتبة (Reaction Role) لرسالة')
        .addStringOption(opt => opt.setName('message_id').setDescription('أيدي الرسالة').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد إعطاؤها عند الضغط').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('النص المكتوب على الزر').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('إضافة زر معلومات تفاعلي لرسالة')
        .addStringOption(opt => opt.setName('message_id').setDescription('أيدي الرسالة').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('النص المكتوب على الزر').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const msgId = interaction.options.getString('message_id');
    const label = interaction.options.getString('label');
    const msg = await interaction.channel.messages.fetch(msgId).catch(() => null);

    if (!msg) {
      return interaction.reply({ content: '❌ لم يتم العثور على الرسالة في هذه القناة.', flags: 64 });
    }

    if (sub === 'role') {
      const role = interaction.options.getRole('role');
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
      return interaction.reply({ content: `✅ تم إضافة زر الرتبة (@${role.name}) للرسالة بنجاح!` });
    } else if (sub === 'info') {
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
  }
};
