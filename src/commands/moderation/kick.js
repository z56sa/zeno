const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'kick',
  description: 'طرد عضو من السيرفر مع إشعار',
  aliases: ['طرد'],
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد عضو من السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد طرده').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('سبب الطرد').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية طرد الأعضاء.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'لم يُذكر سبب';
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
    if (!member.kickable) return interaction.editReply({ content: '❌ لا أستطيع طرد هذا العضو.' });
    if (member.id === interaction.user.id) return interaction.editReply({ content: '❌ لا تستطيع طرد نفسك!' });

    // DM قبل الطرد
    const dmEmbed = new EmbedBuilder()
      .setColor(config.colors?.warning || '#f39c12')
      .setTitle(`👢 تم طردك من ${interaction.guild.name}`)
      .addFields(
        { name: '📋 السبب', value: reason, inline: false },
        { name: '👮 بواسطة', value: interaction.user.tag, inline: true }
      )
      .setFooter({ text: 'يمكنك الانضمام مجدداً إذا كان لديك رابط دعوة صالح' })
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => {});
    await member.kick(`${reason} | بواسطة: ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors?.warning || '#f39c12')
      .setTitle('👢 تم الطرد بنجاح')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '👮 المشرف', value: interaction.user.tag, inline: true },
        { name: '📋 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.deleteReply().catch(() => {});
    await interaction.channel.send({ embeds: [embed] });
    this.sendToLog(interaction.guild, embed);
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply('❌ ليس لديك صلاحية طرد الأعضاء.');

    const targetUser = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply('❌ حدد العضو.');

    const reason = args.slice(1).join(' ') || 'لم يُذكر سبب';
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.kickable) return message.reply('❌ لا أستطيع طرد هذا العضو.');

    await member.send(`👢 تم طردك من **${message.guild.name}**\n📋 **السبب:** ${reason}`).catch(() => {});
    await member.kick(`${reason} | بواسطة: ${message.author.tag}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors?.warning || '#f39c12')
      .setTitle('👢 تم الطرد بنجاح')
      .addFields(
        { name: '👤 العضو', value: targetUser.tag, inline: true },
        { name: '👮 بواسطة', value: message.author.tag, inline: true },
        { name: '📋 السبب', value: reason, inline: false }
      )
      .setTimestamp();

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
