const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'timeout',
  description: 'إسكات عضو مؤقتاً مع إشعار',
  aliases: ['mute', 'إسكات'],
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('إسكات عضو مؤقتاً')
    .addSubcommand(sub => sub.setName('add').setDescription('إسكات عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('المدة (مثال: 10m, 1h, 1d)').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('السبب').setRequired(false)))
    .addSubcommand(sub => sub.setName('remove').setDescription('رفع الإسكات عن عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('السبب').setRequired(false)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية.', flags: 64 });

    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.editReply({ content: '❌ العضو غير موجود.' });
    if (!member.moderatable) return interaction.editReply({ content: '❌ لا أستطيع إسكات هذا العضو.' });

    if (sub === 'add') {
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'لم يُذكر سبب';
      const durationMs = ms(durationStr);
      if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000)
        return interaction.editReply({ content: '❌ مدة غير صالحة. استخدم مثل: `10m`, `1h`, `1d` (الحد الأقصى 28 يوم).' });

      const dmEmbed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`🔇 تم إسكاتك في ${interaction.guild.name}`)
        .addFields(
          { name: '📋 السبب', value: reason },
          { name: '⏳ المدة', value: durationStr },
          { name: '👮 بواسطة', value: interaction.user.tag }
        ).setTimestamp();
      await member.send({ embeds: [dmEmbed] }).catch(() => {});
      await member.timeout(durationMs, `${reason} | بواسطة: ${interaction.user.tag}`);

      if (db.recordStaffAction) {
        db.recordStaffAction(interaction.guild.id, interaction.user.id, 'mute', targetUser.id, reason, durationStr);
      }

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🔇 تم الإسكات بنجاح')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
          { name: '⏳ المدة', value: durationStr, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '📋 السبب', value: reason }
        ).setTimestamp();

      await interaction.deleteReply().catch(() => {});
      await interaction.channel.send({ embeds: [embed] });
      this.sendToLog(interaction.guild, embed);

    } else if (sub === 'remove') {
      const reason = interaction.options.getString('reason') || 'رفع الإسكات';
      await member.timeout(null, reason);
      const embed = new EmbedBuilder()
        .setColor(config.colors?.success || '#2ecc71')
        .setTitle('🔊 تم رفع الإسكات')
        .addFields(
          { name: '👤 العضو', value: targetUser.tag, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '📋 السبب', value: reason }
        ).setTimestamp();

      await interaction.deleteReply().catch(() => {});
      await interaction.channel.send({ embeds: [embed] });
      this.sendToLog(interaction.guild, embed);
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ ليس لديك صلاحية.');
    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply('❌ الاستخدام: `#timeout @user [المدة] [السبب]`');
    const durationStr = args[1];
    if (!durationStr) return message.reply('❌ حدد المدة مثل: `10m` أو `1h`');
    const durationMs = ms(durationStr);
    if (!durationMs) return message.reply('❌ مدة غير صالحة.');
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.moderatable) return message.reply('❌ لا أستطيع إسكات هذا العضو.');
    const reason = args.slice(2).join(' ') || 'لم يُذكر سبب';
    await member.timeout(durationMs, reason);
    const embed = new EmbedBuilder().setColor('#f39c12').setTitle('🔇 تم الإسكات')
      .addFields(
        { name: '👤 العضو', value: targetUser.tag, inline: true },
        { name: '⏳ المدة', value: durationStr, inline: true },
        { name: '📋 السبب', value: reason }
      ).setTimestamp();
    await message.reply({ embeds: [embed] });
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings?.log_channel) {
      const ch = guild.channels.cache.get(settings.log_channel);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
