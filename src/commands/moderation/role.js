const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'role',
  description: 'إدارة أدوار الأعضاء مع دعم الأدوار المؤقتة',
  aliases: ['دور'],
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('إدارة أدوار الأعضاء')
    .addSubcommand(sub => sub.setName('add').setDescription('إضافة دور لعضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('الدور').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('إزالة دور من عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('الدور').setRequired(true)))
    .addSubcommand(sub => sub.setName('temp').setDescription('إضافة دور مؤقت')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('الدور').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('المدة (مثال: 1h, 1d, 7d)').setRequired(true)))
    .addSubcommand(sub => sub.setName('info').setDescription('عرض معلومات دور')
      .addRoleOption(opt => opt.setName('role').setDescription('الدور').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ ليس لديك صلاحية إدارة الأدوار.', flags: 64 });

    await interaction.deferReply().catch(() => {});
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');
    const role = interaction.options.getRole('role');

    if (sub === 'add' || sub === 'remove') {
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ العضو غير موجود.' });
      if (role.position >= interaction.guild.members.me.roles.highest.position)
        return interaction.editReply({ content: '❌ الدور أعلى من دوري، لا أستطيع إدارته.' });

      if (sub === 'add') {
        await member.roles.add(role);
        const embed = new EmbedBuilder().setColor(config.colors?.success || '#2ecc71')
          .setTitle('✅ تم إضافة الدور')
          .addFields(
            { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
            { name: '🎭 الدور', value: `<@&${role.id}>`, inline: true },
            { name: '👮 بواسطة', value: interaction.user.tag, inline: true }
          ).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } else {
        await member.roles.remove(role);
        const embed = new EmbedBuilder().setColor(config.colors?.danger || '#e74c3c')
          .setTitle('❌ تم إزالة الدور')
          .addFields(
            { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
            { name: '🎭 الدور', value: `<@&${role.id}>`, inline: true },
            { name: '👮 بواسطة', value: interaction.user.tag, inline: true }
          ).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }

    } else if (sub === 'temp') {
      const ms = require('ms');
      const durationStr = interaction.options.getString('duration');
      const durationMs = ms(durationStr);
      if (!durationMs) return interaction.editReply({ content: '❌ مدة غير صالحة.' });

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ العضو غير موجود.' });

      await member.roles.add(role);
      const embed = new EmbedBuilder().setColor('#9b59b6')
        .setTitle('⏳ تم إضافة دور مؤقت')
        .addFields(
          { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
          { name: '🎭 الدور', value: `<@&${role.id}>`, inline: true },
          { name: '⏱️ المدة', value: durationStr, inline: true },
          { name: '👮 بواسطة', value: interaction.user.tag, inline: true }
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });

      // إزالة الدور بعد المدة
      setTimeout(async () => {
        await member.roles.remove(role).catch(() => {});
        const logEmbed = new EmbedBuilder().setColor('#e74c3c')
          .setTitle('⏰ انتهى الدور المؤقت')
          .setDescription(`تم إزالة الدور <@&${role.id}> من **${targetUser.tag}** تلقائياً.`)
          .setTimestamp();
        const s = db.getGuildSettings(interaction.guild.id);
        if (s?.log_channel) {
          const ch = interaction.guild.channels.cache.get(s.log_channel);
          if (ch) ch.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }, durationMs);

    } else if (sub === 'info') {
      const embed = new EmbedBuilder().setColor(role.color || 0x5865F2)
        .setTitle(`🎭 معلومات الدور: ${role.name}`)
        .addFields(
          { name: '🆔 الـ ID', value: `\`${role.id}\``, inline: true },
          { name: '🎨 اللون', value: role.hexColor, inline: true },
          { name: '📍 الموضع', value: `${role.position}`, inline: true },
          { name: '👥 الأعضاء', value: `${role.members.size}`, inline: true },
          { name: '📢 يُذكر', value: role.mentionable ? '✅ نعم' : '❌ لا', inline: true },
          { name: '🔒 يُظهر منفصلاً', value: role.hoist ? '✅ نعم' : '❌ لا', inline: true }
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply('❌ ليس لديك صلاحية.');
    const action = args[0]?.toLowerCase();
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!target || !role) return message.reply('❌ الاستخدام: `#role add/remove @user @role`');
    if (action === 'add') {
      await target.roles.add(role);
      message.reply(`✅ تم إضافة <@&${role.id}> لـ **${target.user.tag}**.`);
    } else if (action === 'remove') {
      await target.roles.remove(role);
      message.reply(`✅ تم إزالة <@&${role.id}> من **${target.user.tag}**.`);
    } else {
      message.reply('❌ الاستخدام: `#role add @user @role` أو `#role remove @user @role`');
    }
  }
};
