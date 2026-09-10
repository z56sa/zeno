const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'timeout',
  description: 'عزل / إسكات عضو مؤقتاً في السيرفر (Timeout)',
  aliases: ['عزل', 'تايم_اوت', 'تايماوت', 'to'],
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('عزل / إسكات عضو مؤقتاً في السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد عزله').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('مدة العزل (مثال: 10m, 1h, 1d) - بحد أقصى 28 يوم').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('سبب العزل').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية إدارة الأعضاء (Moderate Members).', flags: 64 });

    const targetUser = interaction.options.getUser('target');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ العضو غير موجود في السيرفر.', flags: 64 });
    if (!member.moderatable) return interaction.reply({ content: '❌ لا أستطيع عزل هذا العضو (رتبته أعلى أو مساوية لرتبتي).', flags: 64 });

    if (member.id === interaction.user.id) return interaction.reply({ content: '❌ لا يمكنك عزل نفسك!', flags: 64 });
    if (member.id === interaction.guild.ownerId) return interaction.reply({ content: '❌ لا يمكنك عزل مالك السيرفر!', flags: 64 });
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: '❌ لا يمكنك عزل عضو رتبته أعلى منك أو مساوية لك.', flags: 64 });
    }

    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'لم يُذكر سبب';
    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000)
      return interaction.reply({ content: '❌ مدة غير صالحة. استخدم مثل: `10m`, `1h`, `1d` (الحد الأدنى 5 ثوانٍ والأقصى 28 يوم).', flags: 64 });

    await interaction.deferReply().catch(() => {});

    const dmEmbed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle(`⏳ تم عزلك مؤقتاً في ${interaction.guild.name}`)
      .addFields(
        { name: '📋 السبب', value: reason },
        { name: '⏳ المدة', value: durationStr },
        { name: '👮 بواسطة', value: interaction.user.tag }
      ).setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    await member.timeout(durationMs, `${reason} | بواسطة: ${interaction.user.tag}`);

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'timeout', targetUser.id, reason, durationStr);
    }

    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('⏳ تم عزل العضو بنجاح (Timeout)')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: '⏳ المدة', value: durationStr, inline: true },
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
    if (!targetUser) return message.reply('❌ الاستخدام: `#timeout @user [المدة: 10m, 1h] [السبب]`');
    const durationStr = args[1];
    if (!durationStr) return message.reply('❌ يرجى تحديد المدة مثل: `10m`, `1h`, `1d`');
    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000)
      return message.reply('❌ مدة غير صالحة. الحد الأدنى 5 ثوانٍ والأقصى 28 يوم.');
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.moderatable) return message.reply('❌ لا أستطيع عزل هذا العضو.');
    if (member.id === message.author.id) return message.reply('❌ لا يمكنك عزل نفسك!');
    if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply('❌ لا يمكنك عزل عضو رتبته أعلى منك أو مساوية لك.');
    }

    const reason = args.slice(2).join(' ') || 'لم يُذكر سبب';
    await member.timeout(durationMs, `${reason} | بواسطة: ${message.author.tag}`);

    if (db.recordStaffAction) {
      db.recordStaffAction(message.guild.id, message.author.id, 'timeout', targetUser.id, reason, durationStr);
    }

    const embed = new EmbedBuilder().setColor('#f39c12').setTitle('⏳ تم عزل العضو بنجاح (Timeout)')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: '⏳ المدة', value: durationStr, inline: true },
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
