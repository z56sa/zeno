const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const config = require('../../config.json');

module.exports = {
  name: 'timeout',
  description: 'إسكات عضو مؤقتاً (Timeout)',
  aliases: ['mute', 'اسكات', 'ميوت'],
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('إسكات عضو مؤقتاً في السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد إسكاته').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('مدة الإسكات (مثال: 10m, 1h, 1d)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('السبب').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إسكات الأعضاء.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('target');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'لم يتم تحديد سبب';

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000) {
      return interaction.reply({ content: '❌ مدة الإسكات غير صالحة. يرجى استخدام صيغ مثل `10m`, `1h`, `1d` (بحد أقصى 28 يوم).', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.moderatable) {
      return interaction.reply({ content: '❌ لا يمكنني إسكات هذا العضو.', ephemeral: true });
    }

    await member.timeout(durationMs, `${reason} | بواسطة ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('🤐 تم إسكات العضو بنجاح')
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
        { name: '⏱️ المدة', value: `\`${durationStr}\``, inline: true },
        { name: '👮 المشرف', value: `${interaction.user.tag}`, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ لا تملك صلاحية إسكات الأعضاء.');
    }

    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply('❌ الاستخدام: `#timeout @user [المدة: 10m/1h] [السبب]`');

    const durationStr = args[1];
    if (!durationStr) return message.reply('❌ يرجى تحديد المدة مثل `10m` أو `1h`.');

    const durationMs = ms(durationStr);
    if (!durationMs) return message.reply('❌ صيغة المدة غير صحيحة.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.moderatable) return message.reply('❌ لا يمكنني إسكات هذا العضو.');

    const reason = args.slice(2).join(' ') || 'لم يتم تحديد سبب';
    await member.timeout(durationMs, `${reason} | بواسطة ${message.author.tag}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('🤐 تم إسكات العضو بنجاح')
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
        { name: '⏱️ المدة', value: `\`${durationStr}\``, inline: true },
        { name: '👮 المشرف', value: `${message.author.tag}`, inline: true },
        { name: '📄 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
