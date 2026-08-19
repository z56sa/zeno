const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'kick',
  description: 'طرد عضو من السيرفر',
  aliases: ['طرد', 'كيك'],
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد عضو من السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد طرده').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('سبب الطرد').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية طرد الأعضاء.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => { });

    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'لم يتم تحديد سبب';
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
    }

    if (!member.kickable) {
      return interaction.editReply({ content: '❌ لا يمكنني طرد هذا العضو.' });
    }

    await member.kick(`${reason} | بواسطة ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('👢 تم طرد العضو بنجاح')
      .addFields(
        { name: '👤 العضو المطرود', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '👮 المشرف', value: `${interaction.user.tag}`, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.deleteReply().catch(() => { });
    await interaction.channel.send({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ لا تملك صلاحية طرد الأعضاء.');
    }

    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply('❌ يرجى منشن العضو أو كتابة الأيدي.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.kickable) return message.reply('❌ لا يمكنني طرد هذا العضو.');

    // التحقق مما إذا كان الوسيط الأول هو منشن أو أيدي لتحديد بداية السبب بشكل صحيح
    const reasonStartIndex = message.mentions.users.first() ? 1 : 1;
    const reason = args.slice(reasonStartIndex).join(' ') || 'لم يتم تحديد سبب';

    await member.kick(`${reason} | بواسطة ${message.author.tag}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('👢 تم طرد العضو بنجاح')
      .addFields(
        { name: '👤 العضو المطرود', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '👮 المشرف', value: `${message.author.tag}`, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};