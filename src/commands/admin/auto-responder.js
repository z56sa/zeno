const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'auto-responder',
  description: 'إدارة نظام الرد التلقائي على الكلمات المحددة',
  aliases: ['رد_تلقائي', 'autoresponder'],
  data: new SlashCommandBuilder()
    .setName('auto-responder')
    .setDescription('إدارة نظام الرد التلقائي')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إضافة رد تلقائي جديد')
        .addStringOption(opt => opt.setName('word').setDescription('الكلمة التي عند كتابتها يرد البوت').setRequired(true))
        .addStringOption(opt => opt.setName('reply').setDescription('رد البوت').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('عرض قائمة الردود التلقائية في السيرفر')
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('حذف رد تلقائي بواسطة رقمه (ID)')
        .addIntegerOption(opt => opt.setName('id').setDescription('رقم الرد التلقائي').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const word = interaction.options.getString('word');
      const reply = interaction.options.getString('reply');

      db.addAutoResponder(guildId, word, reply);

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ تم إضافة الرد التلقائي بنجاح')
        .addFields(
          { name: '💬 عند كتابة:', value: `\`${word}\``, inline: true },
          { name: '🤖 سيرد البوت بـ:', value: reply, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'list') {
      const list = db.getAutoResponders(guildId);
      if (!list || list.length === 0) {
        return interaction.reply({ content: '❌ لا توجد أي ردود تلقائية مضافة في هذا السيرفر بعد.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`📋 قائمة الردود التلقائية | ${interaction.guild.name}`)
        .setDescription(
          list.map(r => `**#${r.id}** | الكلمة: \`${r.trigger_word}\` ➡️ الرد: ${r.reply_text}`).join('\n\n')
        )
        .setFooter({ text: 'لحذف أي رد استخدم /auto-responder delete مع رقم الرد' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'delete') {
      const id = interaction.options.getInteger('id');
      const result = db.deleteAutoResponder(id, guildId);

      if (result.changes > 0) {
        await interaction.reply({ content: `✅ تم حذف الرد التلقائي رقم **#${id}** بنجاح.` });
      } else {
        await interaction.reply({ content: `❌ لم يتم العثور على رد تلقائي يحمل الرقم **#${id}**.`, flags: 64 });
      }
    }
  }
};
