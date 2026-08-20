const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'clear',
  description: 'حذف رسائل متعددة مع فلاتر متقدمة',
  aliases: ['purge', 'حذف'],
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('حذف رسائل من القناة')
    .addIntegerOption(opt => opt.setName('amount').setDescription('عدد الرسائل (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption(opt => opt.setName('target').setDescription('حذف رسائل عضو معين فقط').setRequired(false))
    .addStringOption(opt => opt.setName('filter').setDescription('فلتر نوع الرسائل').setRequired(false)
      .addChoices(
        { name: '🤖 رسائل البوتات فقط', value: 'bots' },
        { name: '🔗 رسائل تحتوي روابط', value: 'links' },
        { name: '🖼️ رسائل تحتوي صور/ملفات', value: 'images' }
      ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return interaction.reply({ content: '❌ ليس لديك صلاحية حذف الرسائل.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('target');
    const filter = interaction.options.getString('filter');

    try {
      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      // فلترة حسب الخيارات
      if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);
      if (filter === 'bots') messages = messages.filter(m => m.author.bot);
      if (filter === 'links') messages = messages.filter(m => /(https?:\/\/[^\s]+)/.test(m.content));
      if (filter === 'images') messages = messages.filter(m => m.attachments.size > 0);

      const toDelete = [...messages.values()].slice(0, amount);

      if (!toDelete.length)
        return interaction.editReply({ content: '⚠️ لا توجد رسائل تطابق الفلتر المحدد.' });

      const deleted = await interaction.channel.bulkDelete(toDelete, true);
      const resultEmbed = new EmbedBuilder()
        .setColor(config.colors?.success || '#2ecc71')
        .setTitle('🗑️ تم حذف الرسائل')
        .addFields(
          { name: '🔢 العدد', value: `${deleted.size}`, inline: true },
          { name: '📁 القناة', value: `<#${interaction.channel.id}>`, inline: true },
          { name: '👮 بواسطة', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });
    } catch (err) {
      await interaction.editReply({ content: '❌ خطأ في حذف الرسائل. الرسائل أقدم من 14 يوماً لا يمكن حذفها دفعة واحدة.' });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ ليس لديك صلاحية.');

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply('❌ حدد عدداً بين 1 و100. مثال: `#clear 50`');

    const targetUser = message.mentions.users.first();
    await message.delete().catch(() => {});

    let messages = await message.channel.messages.fetch({ limit: 100 });
    if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);

    const toDelete = [...messages.values()].slice(0, amount);
    if (!toDelete.length) {
      const reply = await message.channel.send('⚠️ لا توجد رسائل للحذف.');
      setTimeout(() => reply.delete().catch(() => {}), 3000);
      return;
    }

    const deleted = await message.channel.bulkDelete(toDelete, true).catch(() => null);
    const reply = await message.channel.send(`✅ تم حذف **${deleted?.size || 0}** رسالة.`);
    setTimeout(() => reply.delete().catch(() => {}), 3000);
  }
};
