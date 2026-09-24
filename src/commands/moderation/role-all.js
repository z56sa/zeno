const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'role-all',
  description: 'إعطاء رتبة محددة لجميع أعضاء السيرفر أو البوتات أو البشر',
  aliases: ['رول-الكل', 'roleall'],
  data: new SlashCommandBuilder()
    .setName('role-all')
    .setDescription('إعطاء رتبة لجميع الأعضاء أو إزالتها منهم')
    .addSubcommand(sub =>
      sub.setName('give')
        .setDescription('إعطاء رتبة للجميع')
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد إعطاؤها للجميع').setRequired(true))
        .addStringOption(opt =>
          opt.setName('target')
            .setDescription('الفئة المستهدفة')
            .setRequired(false)
            .addChoices(
              { name: '👥 الجميع (بشر وبوتات)', value: 'all' },
              { name: '👤 البشر فقط (بدون بوتات)', value: 'humans' },
              { name: '🤖 البوتات فقط', value: 'bots' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('إزالة رتبة من الجميع')
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد إزالتها من الجميع').setRequired(true))
        .addStringOption(opt =>
          opt.setName('target')
            .setDescription('الفئة المستهدفة')
            .setRequired(false)
            .addChoices(
              { name: '👥 الجميع (بشر وبوتات)', value: 'all' },
              { name: '👤 البشر فقط (بدون بوتات)', value: 'humans' },
              { name: '🤖 البوتات فقط', value: 'bots' }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ ليس لديك صلاحية إدارة الرتب (`Manage Roles`).', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    const targetType = interaction.options.getString('target') || 'all';

    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ البوت لا يمتلك صلاحية إدارة الرتب (`Manage Roles`).', flags: 64 });
    }

    if (role.position >= botMember.roles.highest.position) {
      return interaction.reply({
        content: `❌ رتبة <@&${role.id}> أعلى من أو مساوية لأعلى رتبة للبوت، يرجى رفع رتبة البوت فوقها في إعدادات السيرفر.`,
        flags: 64
      });
    }

    if (role.managed) {
      return interaction.reply({
        content: `❌ هذه الرتبة مدارة تلقائياً بواسطة تطبيق أو تكامل ولا يمكن إضافتها/إزالتها يدوياً.`,
        flags: 64
      });
    }

    await interaction.deferReply().catch(() => {});

    // جلب جميع أعضاء السيرفر
    await interaction.guild.members.fetch().catch(() => {});
    let members = interaction.guild.members.cache;

    if (targetType === 'humans') {
      members = members.filter(m => !m.user.bot);
    } else if (targetType === 'bots') {
      members = members.filter(m => m.user.bot);
    }

    const isGive = sub === 'give';
    const targetMembers = isGive
      ? members.filter(m => !m.roles.cache.has(role.id))
      : members.filter(m => m.roles.cache.has(role.id));

    const totalCount = targetMembers.size;
    if (totalCount === 0) {
      return interaction.editReply({
        content: isGive
          ? `ℹ️ جميع الأعضاء المحددين لديهم رتبة <@&${role.id}> بالفعل.`
          : `ℹ️ لا يوجد أي عضو من الفئة المحددة يمتلك رتبة <@&${role.id}>.`
      });
    }

    const initialEmbed = new EmbedBuilder()
      .setColor(config.colors?.primary || '#9333ea')
      .setTitle(isGive ? '⏳ جارٍ إعطاء الرتبة للجميع...' : '⏳ جارٍ إزالة الرتبة من الجميع...')
      .setDescription(`جارٍ تنفيذ العملية على **${totalCount}** عضو، يُرجى الانتظار لتفادي قيود الديسكورد (Rate-limits).`)
      .addFields(
        { name: '🎭 الرتبة', value: `<@&${role.id}>`, inline: true },
        { name: '🎯 الفئة المستهدفة', value: targetType === 'humans' ? 'بشر فقط' : targetType === 'bots' ? 'بوتات فقط' : 'الجميع', inline: true },
        { name: '🔢 العدد الإجمالي', value: `${totalCount}`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [initialEmbed] });

    let successCount = 0;
    let failCount = 0;

    for (const [, member] of targetMembers) {
      try {
        if (isGive) {
          await member.roles.add(role.id, `Role-All بواسطة ${interaction.user.tag}`);
        } else {
          await member.roles.remove(role.id, `Role-All إزالة بواسطة ${interaction.user.tag}`);
        }
        successCount++;
      } catch (err) {
        failCount++;
      }

      // تأخير بسيط 300ms لتفادي الـ Rate-limit
      await new Promise(r => setTimeout(r, 300));
    }

    const finishEmbed = new EmbedBuilder()
      .setColor(failCount === 0 ? (config.colors?.success || '#2ecc71') : '#e67e22')
      .setTitle(isGive ? '✅ اكتمل إعطاء الرتبة للجميع' : '✅ اكتمل إزالة الرتبة من الجميع')
      .setDescription(
        isGive
          ? `تم الانتهاء بنجاح من إعطاء رتبة <@&${role.id}>!`
          : `تم الانتهاء بنجاح من إزالة رتبة <@&${role.id}>!`
      )
      .addFields(
        { name: '🎭 الرتبة', value: `<@&${role.id}>`, inline: true },
        { name: '✅ نجح', value: `${successCount}`, inline: true },
        { name: '❌ تعذر', value: `${failCount}`, inline: true },
        { name: '👮 المنفذ', value: `<@${interaction.user.id}>`, inline: false }
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [finishEmbed] }).catch(() => {});
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ ليس لديك صلاحية إدارة الرتب (`Manage Roles`).');
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ البوت لا يمتلك صلاحية إدارة الرتب (`Manage Roles`).');
    }

    const action = args[0]?.toLowerCase();
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

    if (!action || !['give', 'add', 'remove', 'del'].includes(action) || !role) {
      return message.reply({
        content: '❌ **طريقة الاستخدام:**\n- `#role-all give @Role` (إعطاء الرتبة للجميع)\n- `#role-all remove @Role` (إزالة الرتبة من الجميع)'
      });
    }

    if (role.position >= botMember.roles.highest.position) {
      return message.reply(`❌ رتبة <@&${role.id}> أعلى من أو مساوية لأعلى رتبة للبوت.`);
    }

    if (role.managed) {
      return message.reply('❌ هذه الرتبة مدارة بواسطة تطبيق ولا يمكن إدارتها يدوياً.');
    }

    const isGive = action === 'give' || action === 'add';
    const statusMsg = await message.reply(`⏳ جارٍ جلب الأعضاء وبدء العملية على رتبة <@&${role.id}>...`);

    await message.guild.members.fetch().catch(() => {});
    const members = message.guild.members.cache;
    const targetMembers = isGive
      ? members.filter(m => !m.roles.cache.has(role.id))
      : members.filter(m => m.roles.cache.has(role.id));

    const totalCount = targetMembers.size;
    if (totalCount === 0) {
      return statusMsg.edit(isGive ? 'ℹ️ جميع الأعضاء يمتلكون هذه الرتبة بالفعل.' : 'ℹ️ لا يوجد أعضاء يمتلكون هذه الرتبة.');
    }

    let successCount = 0;
    let failCount = 0;

    for (const [, member] of targetMembers) {
      try {
        if (isGive) {
          await member.roles.add(role.id, `Role-All بواسطة ${message.author.tag}`);
        } else {
          await member.roles.remove(role.id, `Role-All بواسطة ${message.author.tag}`);
        }
        successCount++;
      } catch (err) {
        failCount++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const finishEmbed = new EmbedBuilder()
      .setColor(config.colors?.success || '#2ecc71')
      .setTitle(isGive ? '✅ اكتمل إعطاء الرتبة للجميع' : '✅ اكتمل إزالة الرتبة من الجميع')
      .addFields(
        { name: '🎭 الرتبة', value: `<@&${role.id}>`, inline: true },
        { name: '✅ نجح', value: `${successCount}`, inline: true },
        { name: '❌ تعذر', value: `${failCount}`, inline: true },
        { name: '👮 المنفذ', value: `<@${message.author.id}>`, inline: false }
      )
      .setTimestamp();

    await statusMsg.edit({ content: null, embeds: [finishEmbed] }).catch(() => {});
  }
};
