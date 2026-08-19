const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'role',
  description: 'إعطاء أو سحب رتبة من عضو',
  aliases: ['رتبة'],
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('إدارة رتب الأعضاء')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إعطاء رتبة لعضو')
        .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('سحب رتبة من عضو')
        .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة الرتب.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: '❌ العضو غير موجود في السيرفر.', ephemeral: true });
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({ content: '❌ رتبة البوت أدنى من هذه الرتبة ولا يمكنه التحكم بها.', ephemeral: true });
    }

    if (sub === 'add') {
      if (member.roles.cache.has(role.id)) {
        return interaction.reply({ content: `❌ المستخدم يملك رتبة **${role.name}** بالفعل.`, ephemeral: true });
      }
      await member.roles.add(role);
      await interaction.reply(`✅ تم إعطاء رتبة **${role.name}** إلى ${user} بنجاح.`);
    } else if (sub === 'remove') {
      if (!member.roles.cache.has(role.id)) {
        return interaction.reply({ content: `❌ المستخدم لا يملك رتبة **${role.name}**.`, ephemeral: true });
      }
      await member.roles.remove(role);
      await interaction.reply(`✅ تمت إزالة رتبة **${role.name}** من ${user} بنجاح.`);
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ لا تملك صلاحية إدارة الرتب.');
    }

    const user = message.mentions.users.first();
    const role = message.mentions.roles.first();

    if (!user || !role) {
      return message.reply('❌ الاستخدام: `#role @user @role` (يقوم بإعطائها إن لم تكن معه أو سحبها إن كانت معه)');
    }

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return message.reply('❌ العضو غير موجود.');

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('❌ رتبة البوت أدنى من هذه الرتبة.');
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      message.reply(`✅ تمت إزالة رتبة **${role.name}** من ${user}.`);
    } else {
      await member.roles.add(role);
      message.reply(`✅ تم إعطاء رتبة **${role.name}** إلى ${user}.`);
    }
  }
};
