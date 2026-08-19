const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'warn',
  description: 'نظام التحذيرات وإدارة سوابق الأعضاء',
  aliases: ['تحذير'],
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('إدارة تحذيرات الأعضاء')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إعطاء تحذير لعضو')
        .addUserOption(opt => opt.setName('target').setDescription('العضو المراد تحذيره').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('سبب التحذير').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('عرض تحذيرات عضو')
        .addUserOption(opt => opt.setName('target').setDescription('العضو المراد فحص سجلاته').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('مسح كافة تحذيرات عضو')
        .addUserOption(opt => opt.setName('target').setDescription('العضو المراد تصفير سجلاته').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية تحذير الأعضاء.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');

    if (subcommand === 'add') {
      const reason = interaction.options.getString('reason');
      db.addWarn(interaction.guild.id, targetUser.id, interaction.user.id, reason);

      const warns = db.getUserWarns(interaction.guild.id, targetUser.id);
      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ تم إضافة تحذير للعضو')
        .addFields(
          { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
          { name: '👮 المشرف', value: `${interaction.user.tag}`, inline: true },
          { name: '📊 إجمالي التحذيرات', value: `\`${warns.length}\``, inline: true },
          { name: '📄 السبب', value: reason, inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'list') {
      const warns = db.getUserWarns(interaction.guild.id, targetUser.id);
      if (warns.length === 0) {
        return interaction.reply({ content: `✅ المستخدم **${targetUser.tag}** نظيف السجل ولا يملك أي تحذيرات.`, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle(`📋 سجل تحذيرات: ${targetUser.tag}`)
        .setDescription(
          warns.map((w, index) => `**#${index + 1}** | بواسطة: <@${w.moderator_id}>\n📅 <t:${Math.floor(w.timestamp / 1000)}:R>\n💬 السبب: \`${w.reason}\``).join('\n\n')
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'clear') {
      db.clearUserWarns(interaction.guild.id, targetUser.id);
      await interaction.reply({ content: `✅ تم مسح وتصفير كافة تحذيرات المستخدم **${targetUser.tag}** بنجاح.` });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ لا تملك صلاحية تحذير الأعضاء.');
    }

    const action = args[0]?.toLowerCase();
    const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);

    if (action === 'clear' && targetUser) {
      db.clearUserWarns(message.guild.id, targetUser.id);
      return message.reply(`✅ تم مسح سجل تحذيرات **${targetUser.tag}**.`);
    }

    if (action === 'list' && targetUser) {
      const warns = db.getUserWarns(message.guild.id, targetUser.id);
      if (warns.length === 0) return message.reply(`✅ المستخدم **${targetUser.tag}** لا يملك تحذيرات.`);

      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle(`📋 سجل تحذيرات: ${targetUser.tag}`)
        .setDescription(
          warns.map((w, index) => `**#${index + 1}** | <@${w.moderator_id}> | \`${w.reason}\``).join('\n')
        );

      return message.reply({ embeds: [embed] });
    }

    // Default: Add warn `#warn @user [reason]`
    const target = message.mentions.users.first();
    if (!target) {
      return message.reply('❌ الاستخدام: `#warn @user [السبب]` أو `#warn list @user` أو `#warn clear @user`');
    }

    const reason = args.slice(1).join(' ') || 'لم يتم تحديد سبب';
    db.addWarn(message.guild.id, target.id, message.author.id, reason);
    const warns = db.getUserWarns(message.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('⚠️ تم إضافة تحذير للعضو')
      .addFields(
        { name: '👤 العضو', value: `${target.tag}`, inline: true },
        { name: '👮 المشرف', value: `${message.author.tag}`, inline: true },
        { name: '📊 إجمالي التحذيرات', value: `\`${warns.length}\``, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
