const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'untimeout',
  description: 'فك العزل / رفع الإسكات عن عضو في السيرفر (Untimeout)',
  aliases: ['فك_عزل', 'فك_التايم_اوت', 'un-timeout', 'unto'],
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('فك العزل عن عضو في السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد فك عزله').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('سبب فك العزل').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية إدارة الأعضاء (Moderate Members).', flags: 64 });

    const targetUser = interaction.options.getUser('target');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ العضو غير موجود في السيرفر.', flags: 64 });
    if (!member.isCommunicationDisabled()) return interaction.reply({ content: '❌ هذا العضو ليس معزولاً حالياً.', flags: 64 });

    const reason = interaction.options.getString('reason') || 'رفع العزل';
    await interaction.deferReply().catch(() => {});

    await member.timeout(null, `${reason} | بواسطة: ${interaction.user.tag}`);

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'untimeout', targetUser.id, reason, null);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.success || '#2ecc71')
      .setTitle('🔊 تم فك العزل عن العضو بنجاح (Untimeout)')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: '👮 المشرف', value: interaction.user.tag, inline: true },
        { name: '📋 السبب', value: reason }
      ).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    this.sendToLog(interaction.guild, embed);
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ ليس لديك صلاحية إدارة الأعضاء.');
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply('❌ الاستخدام: `#untimeout @user [السبب]`');
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('❌ العضو غير موجود في السيرفر.');
    if (!member.isCommunicationDisabled()) return message.reply('❌ هذا العضو ليس معزولاً حالياً.');

    const reason = args.slice(1).join(' ') || 'رفع العزل';
    await member.timeout(null, `${reason} | بواسطة: ${message.author.tag}`);

    if (db.recordStaffAction) {
      db.recordStaffAction(message.guild.id, message.author.id, 'untimeout', targetUser.id, reason, null);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.success || '#2ecc71')
      .setTitle('🔊 تم فك العزل عن العضو بنجاح (Untimeout)')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: '👮 المشرف', value: message.author.tag, inline: true },
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
