const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-autorole',
  description: 'تعيين رتبة تلقائية يتم إعطاؤها للأعضاء الجدد فور دخولهم',
  aliases: ['اوتورول', 'رتبة_تلقائية'],
  data: new SlashCommandBuilder()
    .setName('set-autorole')
    .setDescription('تعيين الرتبة التلقائية للأعضاء الجدد')
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('الرتبة المراد تعيينها (اتركه فارغاً للإلغاء)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }

    const role = interaction.options.getRole('role');

    if (!role) {
      db.updateGuildSetting(interaction.guild.id, 'autorole_id', null);
      return interaction.reply('✅ تم إلغاء وتعطيل الرتبة التلقائية.');
    }

    db.updateGuildSetting(interaction.guild.id, 'autorole_id', role.id);
    await interaction.reply({ content: `✅ تم تعيين الرتبة التلقائية للأعضاء الجدد: **${role.name}** (<@&${role.id}>)` });
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const role = message.mentions.roles.first() || (args[0] ? message.guild.roles.cache.get(args[0]) : null);
    if (!role) return message.reply('❌ يرجى منشن الرتبة. مثال: `#set-autorole @Member`');

    db.updateGuildSetting(message.guild.id, 'autorole_id', role.id);
    message.reply(`✅ تم تعيين الرتبة التلقائية: **${role.name}**`);
  }
};
