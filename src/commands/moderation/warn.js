const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'warn',
  description: 'إدارة تحذيرات الأعضاء مع عقوبات تلقائية',
  aliases: ['تحذير'],
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('إدارة تحذيرات الأعضاء')
    .addSubcommand(sub => sub.setName('add').setDescription('إضافة تحذير لعضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('سبب التحذير').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('عرض تحذيرات عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('حذف تحذير محدد')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addIntegerOption(opt => opt.setName('warn_id').setDescription('رقم التحذير').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('clear').setDescription('مسح جميع تحذيرات عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');

    if (sub === 'add') {
      await interaction.deferReply().catch(() => {});
      const reason = interaction.options.getString('reason');
      const count = db.addWarning(interaction.guild.id, targetUser.id, interaction.user.id, reason);

      // DM للعضو
      const dmEmbed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`⚠️ تلقيت تحذيراً في ${interaction.guild.name}`)
        .addFields(
          { name: '📋 السبب', value: reason },
          { name: '🔢 إجمالي تحذيراتك', value: `${count}` },
          { name: '👮 المشرف', value: interaction.user.tag }
        )
        .setTimestamp();
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (member) await member.send({ embeds: [dmEmbed] }).catch(() => {});

      // عقوبات تلقائية
      let autoPunishment = '';
      if (member) {
        if (count >= 7) {
          await interaction.guild.bans.create(targetUser.id, { reason: `تجاوز حد التحذيرات (${count} تحذيرات)` }).catch(() => {});
          autoPunishment = '🔨 **تم حظره تلقائياً** (7+ تحذيرات)';
        } else if (count >= 5) {
          await member.kick(`تجاوز حد التحذيرات (${count} تحذيرات)`).catch(() => {});
          autoPunishment = '👢 **تم طرده تلقائياً** (5+ تحذيرات)';
        } else if (count >= 3) {
          await member.timeout(60 * 60 * 1000, `تجاوز حد التحذيرات (${count} تحذيرات)`).catch(() => {});
          autoPunishment = '🔇 **تم إسكاته لمدة ساعة** (3+ تحذيرات)';
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ تم إضافة تحذير')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '🔢 مجموع التحذيرات', value: `\`${count}\``, inline: true },
          { name: '📋 السبب', value: reason }
        )
        .setTimestamp();

      if (autoPunishment) embed.addFields({ name: '⚡ عقوبة تلقائية', value: autoPunishment });

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(interaction.guild, embed);

    } else if (sub === 'list') {
      const warns = db.getWarnings(interaction.guild.id, targetUser.id);
      if (!warns.length)
        return interaction.reply({ content: `✅ لا توجد تحذيرات لـ **${targetUser.tag}**.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`⚠️ تحذيرات ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(
          warns.map((w, i) =>
            `**#${i + 1}** | 👮 <@${w.moderator_id}> | 🕐 <t:${Math.floor((w.created_at || Date.now()) / 1000)}:R>\n📋 \`${w.reason}\``
          ).join('\n\n')
        )
        .setFooter({ text: `إجمالي: ${warns.length} تحذير` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'remove') {
      const warnId = interaction.options.getInteger('warn_id');
      const warns = db.getWarnings(interaction.guild.id, targetUser.id);
      if (!warns[warnId - 1]) return interaction.reply({ content: '❌ رقم التحذير غير موجود.', ephemeral: true });
      db.db.prepare('DELETE FROM warnings WHERE id = ?').run(warns[warnId - 1].id);
      await interaction.reply({ content: `✅ تم حذف التحذير #${warnId} لـ **${targetUser.tag}**.` });

    } else if (sub === 'clear') {
      db.clearWarnings(interaction.guild.id, targetUser.id);
      await interaction.reply({ content: `✅ تم مسح جميع تحذيرات **${targetUser.tag}**.` });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ ليس لديك صلاحية.');
    const action = args[0]?.toLowerCase();
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ حدد العضو.');
    if (action === 'clear') {
      db.clearWarnings(message.guild.id, target.id);
      return message.reply(`✅ تم مسح تحذيرات **${target.tag}**.`);
    }
    if (action === 'list') {
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns.length) return message.reply(`✅ لا توجد تحذيرات لـ **${target.tag}**.`);
      const embed = new EmbedBuilder().setColor('#f39c12').setTitle(`⚠️ تحذيرات ${target.tag}`)
        .setDescription(warns.map((w, i) => `**#${i + 1}** | <@${w.moderator_id}> | \`${w.reason}\``).join('\n'));
      return message.reply({ embeds: [embed] });
    }
    const reason = args.slice(1).join(' ') || 'لم يُذكر سبب';
    const count = db.addWarning(message.guild.id, target.id, message.author.id, reason);
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member) await member.send(`⚠️ تحذير من **${message.guild.name}**: ${reason}`).catch(() => {});
    const embed = new EmbedBuilder().setColor('#f39c12').setTitle('⚠️ تم التحذير')
      .addFields(
        { name: '👤 العضو', value: target.tag, inline: true },
        { name: '🔢 التحذيرات', value: `${count}`, inline: true },
        { name: '📋 السبب', value: reason }
      ).setTimestamp();
    await message.reply({ embeds: [embed] });
    this.sendToLog(message.guild, embed);
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings?.log_channel) {
      const ch = guild.channels.cache.get(settings.log_channel);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
