const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'ban',
  description: 'حظر عضو من السيرفر',
  aliases: ['بان', 'حظر'],
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('حظر عضو من السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد حظره').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('سبب الحظر').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية حظر الأعضاء.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => { });

    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'لم يتم تحديد سبب';
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (member && !member.bannable) {
      return interaction.editReply({ content: '❌ لا يمكنني حظر هذا العضو (رتبته أعلى من رتبتي أو مالك السيرفر).' });
    }

    await interaction.guild.bans.create(targetUser.id, { reason: `${reason} | بواسطة ${interaction.user.tag}` });

    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setTitle('🔨 تم حظر العضو بنجاح')
      .addFields(
        { name: '👤 العضو المحظور', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '👮 المشرف', value: `${interaction.user.tag}`, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.deleteReply().catch(() => { });
    await interaction.channel.send({ embeds: [embed] });
    this.sendToLog(interaction.guild, embed);
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ لا تملك صلاحية حظر الأعضاء.');
    }

    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply('❌ يرجى منشن العضو أو كتابة الأيدي الخاص به.');

    const reason = args.slice(1).join(' ') || 'لم يتم تحديد سبب';
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);

    if (member && !member.bannable) {
      return message.reply('❌ لا يمكنني حظر هذا العضو.');
    }

    await message.guild.bans.create(targetUser.id, { reason: `${reason} | بواسطة ${message.author.tag}` });

    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setTitle('🔨 تم حظر العضو بنجاح')
      .addFields(
        { name: '👤 العضو المحظور', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '👮 المشرف', value: `${message.author.tag}`, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    this.sendToLog(message.guild, embed);
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings && settings.log_channel) {
      const logChannel = guild.channels.cache.get(settings.log_channel);
      if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => { });
    }
  }
};